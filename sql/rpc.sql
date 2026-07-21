-- ============================================================
-- tariff-book: canonical Postgres RPC definitions
-- ============================================================
-- Run this in the Supabase SQL Editor (role: postgres). It is idempotent
-- (every object uses CREATE OR REPLACE), so it is safe to re-run any time.
--
-- WHY THIS FILE EXISTS:
--   The RPCs used by frontend/functions/api/* previously lived only inside
--   CLAUDE.md as a spec. That let the *deployed* functions drift from the
--   intended definitions. Symptom seen in production: /api/suggest ignored
--   the kategori / rumah_sakit / tahun / kelas_kamar filters (an early draft
--   of suggest_tarif was deployed whose body dropped the filter conditions).
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
    "tahun":"t.tahun","rumah_sakit":"t.rumah_sakit","kategori_harga":"t.kategori_harga",
    "nama_layanan":"t.nama_layanan","kelas_kamar":"t.kelas_kamar","tarif":"t.tarif",
    "pct_increase":"pct_increase"}';
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
  -- stable tiebreakers
  if not ('t.nama_layanan' = any(used)) then parts := parts || 't.nama_layanan asc';  end if;
  if not ('t.tarif'        = any(used)) then parts := parts || 't.tarif desc';         end if;
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
  rumah_sakit text, tahun int, pct_increase numeric, total_count bigint
)
language plpgsql stable as $$
declare
  v_offset int  := (greatest(page, 1) - 1) * page_size;
  v_order  text := build_order_by(sort);
begin
  return query execute
    $q$
    select t.kategori_harga::text, t.nama_layanan::text, t.kelas_kamar::text,
           t.tarif::numeric, t.rumah_sakit::text, t.tahun::int,
           case when t.tahun = 2026 and p.tarif is not null and p.tarif <> 0
                then round((t.tarif - p.tarif) * 100.0 / p.tarif, 2)
           end as pct_increase,
           count(*) over() as total_count
    from tarif t
    left join tarif p
      on t.nama_layanan   = p.nama_layanan
     and t.kategori_harga = p.kategori_harga
     and t.kelas_kamar is not distinct from p.kelas_kamar
     and p.tahun = 2025
    where ($1 is null or (t.nama_layanan ilike '%' || esc_like($1) || '%'
                          or $1 <% t.nama_layanan))
      and ($2 is null or t.kategori_harga = any($2))
      and ($3 is null or t.rumah_sakit    = any($3))
      and ($4 is null or t.tahun          = any($4))
      and ($5 is null or t.kelas_kamar    = any($5))
    order by
    $q$ || v_order || $q$
    limit $6 offset $7
    $q$
  using q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, page_size, v_offset;
end $$;

-- --- RPC: suggest (autocomplete, max 6) -------------------------
-- NOTE: the four f_* filters MUST be applied in the WHERE clause. This is the
-- exact function whose deployed copy had drifted and returned unfiltered rows.
create or replace function suggest_tarif(
  q text,
  f_kategori text[] default null,
  f_rumah_sakit text[] default null,
  f_tahun int[] default null,
  f_kelas text[] default null
)
returns table (nama_layanan text, kategori_harga text)
language sql stable as $$
  select nama_layanan::text, kategori_harga::text
  from (
    select distinct on (nama_layanan) nama_layanan, kategori_harga
    from tarif
    where (q is null or (nama_layanan ilike '%' || esc_like(q) || '%' or q <% nama_layanan))
      and (f_kategori    is null or kategori_harga = any(f_kategori))
      and (f_rumah_sakit is null or rumah_sakit    = any(f_rumah_sakit))
      and (f_tahun       is null or tahun          = any(f_tahun))
      and (f_kelas       is null or kelas_kamar    = any(f_kelas))
    order by nama_layanan
  ) s
  order by word_similarity(q, nama_layanan) desc nulls last, nama_layanan asc
  limit 6;
$$;

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
  select nama_layanan::text, kategori_harga::text, rumah_sakit::text,
         tahun::int, kelas_kamar::text, tarif::numeric
  from tarif
  where (q is null or (nama_layanan ilike '%' || esc_like(q) || '%' or q <% nama_layanan))
    and (f_kategori    is null or kategori_harga = any(f_kategori))
    and (f_rumah_sakit is null or rumah_sakit    = any(f_rumah_sakit))
    and (f_tahun       is null or tahun          = any(f_tahun))
    and (f_kelas       is null or kelas_kamar    = any(f_kelas))
  limit row_limit;
$$;

-- --- RPC: filters (all dropdown values + relations, as JSON) ----
create or replace function get_filters()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'kategori',    (select coalesce(jsonb_agg(k order by k),'[]') from (select distinct kategori_harga k from tarif) x),
    'rumah_sakit', (select coalesce(jsonb_agg(r order by r),'[]') from (select distinct rumah_sakit r from tarif) x),
    'tahun',       (select coalesce(jsonb_agg(th order by th desc),'[]') from (select distinct tahun th from tarif) x),
    'kelas_kamar', (select coalesce(jsonb_agg(kk order by kk),'[]') from (select distinct kelas_kamar kk from tarif where kelas_kamar is not null) x),
    'relations',   (select coalesce(jsonb_agg(jsonb_build_object('kategori_harga',kategori_harga,'rumah_sakit',rumah_sakit) order by kategori_harga,rumah_sakit),'[]')
                    from (select distinct kategori_harga, rumah_sakit from tarif) x),
    'kelas_relations', (select coalesce(jsonb_agg(jsonb_build_object('kelas_kamar',kelas_kamar,'rumah_sakit',rumah_sakit) order by kelas_kamar,rumah_sakit),'[]')
                    from (select distinct kelas_kamar, rumah_sakit from tarif where kelas_kamar is not null) x)
  );
$$;

-- --- Grants (anon must be able to EXECUTE the RPCs) -------------
grant execute on function search_tarif        to anon;
grant execute on function suggest_tarif       to anon;
grant execute on function compare_rows_tarif  to anon;
grant execute on function get_filters         to anon;

-- --- Refresh planner stats --------------------------------------
analyze tarif;
