-- ============================================================
-- tariff-book golongan project: functions (run 2nd)
-- ============================================================
-- Run in the Supabase SQL Editor (role: postgres). Idempotent.
-- Mirrors what the Golongan Operasi tab used to do in the browser:
-- substring search on nama_layanan / specialty, multi-select filters,
-- multi-column sort where golongan follows its tier (not the alphabet),
-- 50 rows per page.
-- ============================================================

-- Tier order. 'SEDANG' without a number only appears in the Grand Wisata
-- book and sorts before the numbered SEDANG tiers. Unknown values go last.
create or replace function golongan_rank(g text)
returns int language sql immutable as $$
  select coalesce(array_position(array[
    'KECIL', 'SEDANG', 'SEDANG 1', 'SEDANG 2', 'SEDANG 3',
    'BESAR 1', 'BESAR 2', 'BESAR 3',
    'KHUSUS 1', 'KHUSUS 2', 'KHUSUS 3'], g), 1000);
$$;

create or replace function golongan_esc_like(s text)
returns text language sql immutable as $$
  select replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- sort: "col:asc,col:desc" with col in rumah_sakit, specialty, golongan,
-- nama_layanan (anything else is ignored). Default: rumah_sakit, specialty,
-- golongan ascending. nama_layanan ascending is always the last tiebreaker.
create or replace function golongan_order_by(sort text)
returns text language plpgsql immutable as $$
declare
  allowed jsonb := '{
    "rumah_sakit":"rumah_sakit collate golongan_id",
    "specialty":"specialty collate golongan_id",
    "golongan":"golongan_rank(golongan)",
    "nama_layanan":"nama_layanan collate golongan_id"}';
  parts text[] := '{}';
  used  text[] := '{}';
  tok text; col text; expr text; dir text;
begin
  foreach tok in array string_to_array(coalesce(nullif(sort, ''), 'rumah_sakit:asc,specialty:asc,golongan:asc'), ',') loop
    col  := trim(split_part(tok, ':', 1));
    expr := allowed ->> col;
    if expr is null or col = any(used) then continue; end if;
    dir := case when lower(trim(split_part(tok, ':', 2))) = 'desc' then 'desc' else 'asc' end;
    parts := parts || (expr || ' ' || dir);
    used  := used || col;
  end loop;
  if not ('nama_layanan' = any(used)) then
    parts := parts || 'nama_layanan collate golongan_id asc'::text;
  end if;
  return array_to_string(parts, ', ') || ', id asc';
end $$;

create or replace function search_golongan(
  q text default null,
  f_rumah_sakit text[] default null,
  f_specialty text[] default null,
  f_golongan text[] default null,
  sort text default null,
  page int default 1,
  page_size int default 50
)
returns table (
  rumah_sakit text, specialty text, golongan text, service_code text,
  nama_layanan text, total_count bigint
)
language plpgsql stable as $$
begin
  return query execute
    'select g.rumah_sakit, g.specialty, g.golongan, g.service_code, g.nama_layanan,
            count(*) over () as total_count
     from golongan_operasi g
     where ($1 is null or g.nama_layanan ilike ''%'' || golongan_esc_like($1) || ''%''
                       or g.specialty    ilike ''%'' || golongan_esc_like($1) || ''%'')
       and ($2 is null or g.rumah_sakit = any($2))
       and ($3 is null or g.specialty   = any($3))
       and ($4 is null or g.golongan    = any($4))
     order by ' || golongan_order_by(sort) || '
     limit $5 offset $6'
  using nullif(trim(q), ''), f_rumah_sakit, f_specialty, f_golongan,
        page_size, (greatest(page, 1) - 1) * page_size;
end $$;

-- Dropdown values: hospitals and specialties A-Z, golongan by tier.
create or replace function get_golongan_filters()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'rumah_sakit', (select coalesce(jsonb_agg(v order by v collate golongan_id), '[]')
                    from (select distinct rumah_sakit v from golongan_operasi) x),
    'specialty',   (select coalesce(jsonb_agg(v order by v collate golongan_id), '[]')
                    from (select distinct specialty v from golongan_operasi) x),
    'golongan',    (select coalesce(jsonb_agg(v order by golongan_rank(v), v), '[]')
                    from (select distinct golongan v from golongan_operasi) x)
  );
$$;

-- Same name and shape as on the tarif shards, so the keep-alive Worker and
-- the upload script can use it here too.
create or replace function shard_stats()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'db_size',       pg_size_pretty(pg_database_size(current_database())),
    'hospitals', (
      select coalesce(jsonb_agg(jsonb_build_object('rumah_sakit', rumah_sakit, 'rows', n)
                                order by n desc), '[]')
      from (select rumah_sakit, count(*) as n from golongan_operasi group by rumah_sakit) c
    )
  );
$$;

analyze golongan_operasi;
