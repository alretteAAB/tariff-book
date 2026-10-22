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

-- --- Helper: tarif_v2 conditions for the search/compare filters ---
-- Turns the text filters into id lists first (small reference tables, with
-- indexes), so the big tarif_v2 table is only read through its indexes.
-- Matching by name or by id is equivalent: every name is unique in its
-- reference table. Returns SQL for a WHERE clause on alias "tv".
create or replace function tarif_where(
  q text, f_kategori text[], f_rumah_sakit text[], f_tahun int[], f_kelas text[],
  match_kategori boolean
)
returns text language plpgsql stable as $$
declare
  conds text[] := array[
    'tv.kategori_id is not null', 'tv.layanan_id is not null'];
  ids text;
begin
  -- hospitals: only those listed in rumahsakit (the old view joined it)
  select coalesce(string_agg(rs.id::text, ','), '') into ids
  from rumah_sakit_ref rs join rumahsakit r on r.rumah_sakit = rs.nama
  where f_rumah_sakit is null or r.display_name = any(f_rumah_sakit);
  conds := conds || format('tv.rumah_sakit_id = any(''{%s}''::smallint[])', ids);

  if q is not null then
    select coalesce(string_agg(id::text, ','), '') into ids from layanan_ref
    where nama ilike '%' || esc_like(q) || '%' or q <% nama;
    if match_kategori then
      conds := conds || format(
        '(tv.layanan_id = any(''{%s}''::int[]) or tv.kategori_id = any(''{%s}''::smallint[]))', ids,
        (select coalesce(string_agg(id::text, ','), '') from kategori_ref
         where nama ilike '%' || esc_like(q) || '%'));
    else
      conds := conds || format('tv.layanan_id = any(''{%s}''::int[])', ids);
    end if;
  end if;
  if f_kategori is not null then
    conds := conds || format('tv.kategori_id = any(''{%s}''::smallint[])',
      (select coalesce(string_agg(id::text, ','), '') from kategori_ref where nama = any(f_kategori)));
  end if;
  if f_tahun is not null then
    conds := conds || format('tv.tahun = any(%L::smallint[])', f_tahun);
  end if;
  if f_kelas is not null then
    conds := conds || format('tv.kelas_kamar_id = any(''{%s}''::smallint[])',
      (select coalesce(string_agg(kk.id::text, ','), '')
       from kelas_kamar_ref kk left join room_class_mapping rm on rm.room_class = kk.nama
       where coalesce(rm.mapped_room_class, kk.nama) = any(f_kelas)));
  end if;
  return array_to_string(conds, ' and ');
end $$;

-- --- RPC: search (data + total for pagination) ------------------
-- Same result as before (rows, order, pct_increase, total_count), but:
-- * keyword and filters become id lists first (tarif_where), so tarif_v2 is
--   read through its indexes instead of joining all 1.8M rows to compare
--   names;
-- * the total is counted separately, so fetching one page can stop early
--   instead of materializing every match.
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
  v_where  text := tarif_where(q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, true);
  -- one row per matching tarif row and per matching 2025 row (the old join
  -- produced a row for each 2025 match; kept so totals and pages match)
  v_from   text := format($f$
    from (select tv.*, k.nama as kategori_harga, l.nama as nama_layanan,
                 kk.nama as kelas_kamar, rs.nama as rumah_sakit
          from tarif_v2 tv
          join kategori_ref k          on k.id  = tv.kategori_id
          join layanan_ref l           on l.id  = tv.layanan_id
          join rumah_sakit_ref rs      on rs.id = tv.rumah_sakit_id
          left join kelas_kamar_ref kk on kk.id = tv.kelas_kamar_id
          where %s %%s) t
    join rumahsakit r on r.rumah_sakit = t.rumah_sakit
    left join room_class_mapping rm on rm.room_class = t.kelas_kamar
    left join tarif_v2 p
      on p.layanan_id  = t.layanan_id
     and p.kategori_id = t.kategori_id
     and p.kelas_kamar_id is not distinct from t.kelas_kamar_id
     and p.tahun = 2025
     and p.rumah_sakit_id is not null$f$, v_where);
  v_total bigint;
begin
  execute 'select count(*) ' || format(v_from, '') into v_total;
  if v_total = 0 then return; end if;

  -- Up to ~100k matches: fetch them first, then sort (OFFSET 0 keeps the
  -- planner from instead walking every service name in sort order hoping to
  -- find a page's worth early, which is slow when matches are rare).
  -- Larger results keep the walk, which is the fast plan there.
  v_from := format(v_from, case when v_total <= 100000 then 'offset 0' else '' end);

  return query execute
    'select t.kategori_harga::text, t.nama_layanan::text,
            coalesce(rm.mapped_room_class, t.kelas_kamar)::text as kelas_kamar,
            t.tarif::numeric, r.display_name::text as rumah_sakit, r.nama_group::text as nama_group,
            t.tahun::int,
            case when t.tahun = 2026 and p.tarif is not null and p.tarif <> 0
                 then round((t.tarif - p.tarif) * 100.0 / p.tarif, 2)
            end as pct_increase,
            $1 as total_count '
    || v_from || ' order by ' || v_order || ' limit $2 offset $3'
  using v_total, page_size, v_offset;
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
-- Keyword matches service names only (not categories), as before.
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
language plpgsql stable as $$
begin
  return query execute format($f$
    select l.nama::text, k.nama::text, r.display_name::text,
           tv.tahun::int, coalesce(rm.mapped_room_class, kk.nama)::text, tv.tarif::numeric
    from tarif_v2 tv
    join kategori_ref k             on k.id  = tv.kategori_id
    join layanan_ref l              on l.id  = tv.layanan_id
    join rumah_sakit_ref rs         on rs.id = tv.rumah_sakit_id
    join rumahsakit r               on r.rumah_sakit = rs.nama
    left join kelas_kamar_ref kk    on kk.id = tv.kelas_kamar_id
    left join room_class_mapping rm on rm.room_class = kk.nama
    where %s
    limit $1$f$, tarif_where(q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, false))
  using row_limit;
end $$;

-- --- RPC: filters (all dropdown values + relations, as JSON) ----
-- Computing these reads the whole table (seconds on 1.8M rows), and the
-- website asks on every page load, so the result is stored in filters_cache
-- (01_schema.sql) and only recomputed by refresh_filters(): the upload and
-- move scripts call it when they are done. After changing data by hand,
-- run:  select refresh_filters();
create or replace function compute_filters()
returns jsonb language sql stable as $$
  with rel as (   -- hospital x category pairs that have rows
    select distinct k.nama as kategori_harga, r.display_name as rumah_sakit
    from (select distinct rumah_sakit_id, kategori_id from tarif_v2
          where layanan_id is not null) x
    join kategori_ref k     on k.id  = x.kategori_id
    join rumah_sakit_ref rs on rs.id = x.rumah_sakit_id
    join rumahsakit r       on r.rumah_sakit = rs.nama
  ), krel as (    -- hospital x room class pairs that have rows
    select distinct coalesce(rm.mapped_room_class, kk.nama) as kelas_kamar, r.display_name as rumah_sakit
    from (select distinct rumah_sakit_id, kelas_kamar_id from tarif_v2
          where layanan_id is not null and kategori_id is not null and kelas_kamar_id is not null) x
    join kelas_kamar_ref kk         on kk.id = x.kelas_kamar_id
    join rumah_sakit_ref rs         on rs.id = x.rumah_sakit_id
    join rumahsakit r               on r.rumah_sakit = rs.nama
    left join room_class_mapping rm on rm.room_class = kk.nama
  )
  select jsonb_build_object(
    'kategori',    (select coalesce(jsonb_agg(k.nama order by k.nama), '[]') from kategori_ref k
                    where exists (select 1 from tarif_v2 t where t.kategori_id = k.id
                                  and t.rumah_sakit_id is not null and t.layanan_id is not null)),
    'rumah_sakit', (select coalesce(jsonb_agg(d order by d), '[]') from (select distinct display_name d from rumahsakit) x),
    'tahun',       (select coalesce(jsonb_agg(th order by th desc), '[]')
                    from (select distinct tahun th from tarif_v2
                          where rumah_sakit_id is not null and kategori_id is not null and layanan_id is not null) x),
    'kelas_kamar', (select coalesce(jsonb_agg(kk order by kk), '[]')
                    from (select distinct coalesce(mapped_room_class, room_class) kk from room_class_mapping) x
                    where kk is not null),
    'relations',       (select coalesce(jsonb_agg(jsonb_build_object('kategori_harga', kategori_harga, 'rumah_sakit', rumah_sakit)
                                                  order by kategori_harga, rumah_sakit), '[]') from rel),
    'kelas_relations', (select coalesce(jsonb_agg(jsonb_build_object('kelas_kamar', kelas_kamar, 'rumah_sakit', rumah_sakit)
                                                  order by kelas_kamar, rumah_sakit), '[]') from krel)
  );
$$;

create or replace function refresh_filters()
returns jsonb language sql volatile as $$
  insert into filters_cache (id, data, refreshed_at) values (1, compute_filters(), now())
  on conflict (id) do update set data = excluded.data, refreshed_at = excluded.refreshed_at
  returning data;
$$;

-- What the website calls: the stored result, or a live computation when the
-- cache has never been filled.
create or replace function get_filters()
returns jsonb language sql stable as $$
  select coalesce((select data from filters_cache where id = 1), compute_filters());
$$;

-- --- Refresh planner stats --------------------------------------
analyze tarif_v2;
