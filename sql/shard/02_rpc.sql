-- ============================================================
-- tariff-book shard: RPC definitions (run 2nd, after 01_schema.sql)
-- ============================================================
-- Run this in the Supabase SQL Editor (role: postgres) on EVERY shard.
-- It is idempotent, so it is safe to re-run any time.
--
-- WHY THIS FILE EXISTS:
--   The RPCs used by frontend/functions/api/* must not live only inside the
--   database, or the repo drifts from what is deployed. This file mirrors the
--   functions running in production (pg_get_functiondef, 2026-10-14):
--   everything reads the `tarif` view (01_schema.sql), which joins the
--   normalized `tarif_v2` with its *_ref tables; hospital names come from
--   `rumahsakit.display_name` and room classes are normalized through
--   `room_class_mapping`.
--   Keep this file as the single source of truth; re-run it after any change.
-- ============================================================

-- --- Helper: escape ILIKE wildcards -----------------------------
create or replace function esc_like(s text)
returns text language sql immutable as $$
  select replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- --- Helper: whitelist-safe ORDER BY builder --------------------
create or replace function build_order_by(sort text)
returns text language plpgsql immutable as $$
declare
  allowed jsonb := '{
    "tahun":"t.tahun","rumah_sakit":"r.display_name","nama_group":"r.nama_group",
    "kategori_harga":"t.kategori_harga","nama_layanan":"t.nama_layanan",
    "kelas_kamar":"coalesce(rm.mapped_room_class, t.kelas_kamar)",
    "tarif":"t.tarif","pct_increase":"pct_increase"}';
  parts text[] := '{}';
  used  text[] := '{}';
  tok text; col_sql text; dir text;
begin
  foreach tok in array string_to_array(coalesce(sort, ''), ',') loop
    col_sql := allowed ->> trim(split_part(tok, ':', 1));
    if col_sql is null or col_sql = any(used) then continue; end if;
    dir := case when lower(split_part(tok, ':', 2)) = 'asc' then 'asc' else 'desc' end;
    parts := parts || (col_sql || ' ' || dir || ' nulls last');
    used  := used  || col_sql;
  end loop;
  if not ('t.nama_layanan' = any(used)) then parts := parts || 't.nama_layanan asc'::text;  end if;
  if not ('t.tarif'        = any(used)) then parts := parts || 't.tarif desc'::text;         end if;
  return array_to_string(parts, ', ');
end $$;

-- --- RPC: search (data + total for pagination) ------------------
create or replace function search_tarif(
  q text default null,
  f_kategori text[] default null,
  f_rumah_sakit text[] default null,
  f_tahun int[] default null,
  f_kelas text[] default null,
  sort text default null,
  page int default 1,
  page_size int default 50
)
returns table (
  kategori_harga text, nama_layanan text, kelas_kamar text, tarif numeric,
  rumah_sakit text, nama_group text, tahun int, pct_increase numeric, total_count bigint
)
language plpgsql stable as $$
declare
  v_offset int  := (greatest(page, 1) - 1) * page_size;
  v_order  text := build_order_by(sort);
begin
  return query execute
    $q$
    select t.kategori_harga::text, t.nama_layanan::text,
           coalesce(rm.mapped_room_class, t.kelas_kamar)::text as kelas_kamar,
           t.tarif::numeric, r.display_name::text as rumah_sakit, r.nama_group::text as nama_group,
           t.tahun::int,
           case when t.tahun = 2026 and p.tarif is not null and p.tarif <> 0
                then round((t.tarif - p.tarif) * 100.0 / p.tarif, 2)
           end as pct_increase,
           count(*) over() as total_count
    from tarif t
    join rumahsakit r on r.rumah_sakit = t.rumah_sakit
    left join room_class_mapping rm on rm.room_class = t.kelas_kamar
    left join tarif p
      on t.nama_layanan   = p.nama_layanan
     and t.kategori_harga = p.kategori_harga
     and t.kelas_kamar is not distinct from p.kelas_kamar  -- unchanged: raw match
     and p.tahun = 2025
    where ($1 is null or (t.nama_layanan ilike '%' || esc_like($1) || '%'
                          or $1 <% t.nama_layanan
                          or t.kategori_harga ilike '%' || esc_like($1) || '%'))
      and ($2 is null or t.kategori_harga = any($2))
      and ($3 is null or r.display_name   = any($3))
      and ($4 is null or t.tahun          = any($4))
      and ($5 is null or coalesce(rm.mapped_room_class, t.kelas_kamar) = any($5))
    order by
    $q$ || v_order || $q$
    limit $6 offset $7
    $q$
  using q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, page_size, v_offset;
end $$;

-- --- RPC: suggest (autocomplete, max 6) -------------------------
-- NOTE: the four f_* filters MUST be applied. An earlier deployed copy had
-- drifted and returned unfiltered rows.
-- `score` (word_similarity) lets the API merge suggestions from several
-- shards in the same order a single database would produce.
--
-- Two strategies, picked by the filters (anon has a ~3 s statement timeout):
-- - category or hospital filter: one set-based query; those filters are
--   selective, so Postgres starts from their indexes and reads little.
-- - otherwise: matching service names (trigram index on layanan_ref) are
--   walked best match first; each is checked with one index lookup on
--   tarif_v2 and the loop stops at 6. The set-based query would scan all
--   of tarif_v2 here, which timed out on the free plan.
-- Both return the same names in the same order.
-- The return type changed (score), so the old signature is dropped first;
-- re-run 04_security.sql afterwards for the grant.
drop function if exists suggest_tarif(text, text[], text[], int[], text[]);
create function suggest_tarif(
  q text,
  f_kategori text[] default null,
  f_rumah_sakit text[] default null,
  f_tahun int[] default null,
  f_kelas text[] default null
)
returns table (nama_layanan text, kategori_harga text, score real)
language plpgsql stable as $$
#variable_conflict use_column
declare
  c record;
  kat text;
  n int := 0;
begin
  if f_kategori is not null or f_rumah_sakit is not null then
    return query
    select s.nama_layanan::text, s.kategori_harga::text, word_similarity(q, s.nama_layanan) as score
    from (
      select distinct on (t.nama_layanan) t.nama_layanan, t.kategori_harga
      from tarif t
      join rumahsakit r on r.rumah_sakit = t.rumah_sakit
      left join room_class_mapping rm on rm.room_class = t.kelas_kamar
      where (q is null or (t.nama_layanan ilike '%' || esc_like(q) || '%' or q <% t.nama_layanan))
        and (f_kategori    is null or t.kategori_harga = any(f_kategori))
        and (f_rumah_sakit is null or r.display_name    = any(f_rumah_sakit))
        and (f_tahun       is null or t.tahun          = any(f_tahun))
        and (f_kelas       is null or coalesce(rm.mapped_room_class, t.kelas_kamar) = any(f_kelas))
      order by t.nama_layanan
    ) s
    order by 3 desc nulls last, 1 asc
    limit 6;
    return;
  end if;

  for c in
    select l.id, l.nama, word_similarity(q, l.nama) as s
    from layanan_ref l
    where q is null or l.nama ilike '%' || esc_like(q) || '%' or q <% l.nama
    order by s desc nulls last, l.nama asc
  loop
    select k.nama into kat
    from tarif_v2 t
    join kategori_ref k             on k.id  = t.kategori_id
    join rumah_sakit_ref rs         on rs.id = t.rumah_sakit_id
    join rumahsakit r               on r.rumah_sakit = rs.nama
    left join kelas_kamar_ref kk    on kk.id = t.kelas_kamar_id
    left join room_class_mapping rm on rm.room_class = kk.nama
    where t.layanan_id = c.id
      and (f_tahun is null or t.tahun = any(f_tahun))
      and (f_kelas is null or coalesce(rm.mapped_room_class, kk.nama) = any(f_kelas))
    limit 1;
    if found then
      nama_layanan := c.nama; kategori_harga := kat; score := c.s;
      return next;
      n := n + 1;
      exit when n = 6;
    end if;
  end loop;
end $$;

-- --- RPC: raw rows for /compare (pivot happens in JS) -----------
create or replace function compare_rows_tarif(
  q text default null,
  f_kategori text[] default null,
  f_rumah_sakit text[] default null,
  f_tahun int[] default null,
  f_kelas text[] default null,
  row_limit int default 10000
)
returns table (
  nama_layanan text, kategori_harga text, rumah_sakit text,
  tahun int, kelas_kamar text, tarif numeric
)
language sql stable as $$
  select t.nama_layanan::text, t.kategori_harga::text, r.display_name::text as rumah_sakit,
         t.tahun::int, coalesce(rm.mapped_room_class, t.kelas_kamar)::text as kelas_kamar,
         t.tarif::numeric
  from tarif t
  join rumahsakit r on r.rumah_sakit = t.rumah_sakit
  left join room_class_mapping rm on rm.room_class = t.kelas_kamar
  where (q is null or (t.nama_layanan ilike '%' || esc_like(q) || '%' or q <% t.nama_layanan))
    and (f_kategori    is null or t.kategori_harga = any(f_kategori))
    and (f_rumah_sakit is null or r.display_name    = any(f_rumah_sakit))
    and (f_tahun       is null or t.tahun          = any(f_tahun))
    and (f_kelas       is null or coalesce(rm.mapped_room_class, t.kelas_kamar) = any(f_kelas))
  limit row_limit;
$$;

-- --- RPC: filters (all dropdown values + relations, as JSON) ----
create or replace function get_filters()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'kategori',    (select coalesce(jsonb_agg(k order by k),'[]') from (select distinct kategori_harga k from tarif) x),
    'rumah_sakit', (select coalesce(jsonb_agg(d order by d),'[]') from (select distinct display_name d from rumahsakit) x),
    'tahun',       (select coalesce(jsonb_agg(th order by th desc),'[]') from (select distinct tahun th from tarif) x),
    'kelas_kamar', (select coalesce(jsonb_agg(kk order by kk),'[]')
                    from (select distinct coalesce(mapped_room_class, room_class) kk from room_class_mapping) x
                    where kk is not null),
    'relations',   (select coalesce(jsonb_agg(jsonb_build_object('kategori_harga',kategori_harga,'rumah_sakit',rumah_sakit) order by kategori_harga,rumah_sakit),'[]')
                    from (select distinct t.kategori_harga, r.display_name as rumah_sakit
                          from tarif t join rumahsakit r on r.rumah_sakit = t.rumah_sakit) x),
    'kelas_relations', (select coalesce(jsonb_agg(jsonb_build_object('kelas_kamar',kelas_kamar,'rumah_sakit',rumah_sakit) order by kelas_kamar,rumah_sakit),'[]')
                    from (select distinct coalesce(rm.mapped_room_class, t.kelas_kamar) as kelas_kamar,
                                          r.display_name as rumah_sakit
                          from tarif t
                          join rumahsakit r on r.rumah_sakit = t.rumah_sakit
                          left join room_class_mapping rm on rm.room_class = t.kelas_kamar
                          where coalesce(rm.mapped_room_class, t.kelas_kamar) is not null) x)
  );
$$;

-- --- Refresh planner stats --------------------------------------
analyze tarif_v2;
