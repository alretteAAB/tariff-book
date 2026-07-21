-- Buku Tarif — tambah tabel rumahsakit (nama tampilan + kelompok) dan
-- sambungkan ke tarif via join. Jalankan sekali di Supabase SQL Editor
-- (role: postgres). Aman dijalankan ulang.
--
-- Efek pada RPC yang sudah ada:
--   - search_tarif()   -> menambah kolom rumah_sakit_display, kelompok
--                         dan sort by 'rumah_sakit' sekarang mengurutkan
--                         berdasarkan display_name, bukan kode.
--   - get_filters()    -> menambah key 'rumah_sakit_info' (metadata per kode
--                         rumah sakit untuk label dropdown/chip di frontend).
--   - compare_rows_tarif() tidak diubah (tetap kirim kode mentah; mapping ke
--                         display_name dilakukan di frontend pakai rumah_sakit_info).

-- --- Tabel rumahsakit --------------------------------------------
create table if not exists rumahsakit (
  rumah_sakit      text primary key references tarif (rumah_sakit) deferrable initially deferred,
  display_name     text not null,
  group_non_group  text,
  nama_group       text
);
-- Catatan: FK ke tarif.rumah_sakit butuh constraint unique/PK di kolom itu.
-- Jika tarif.rumah_sakit TIDAK unique (kemungkinan besar, karena satu RS
-- punya banyak baris tarif), hapus baris "references tarif (rumah_sakit)"
-- di atas sebelum menjalankan — cukup text primary key saja sudah cukup
-- untuk join di bawah.

alter table rumahsakit enable row level security;
drop policy if exists "public read rumahsakit" on rumahsakit;
create policy "public read rumahsakit" on rumahsakit
  for select to anon using (true);

-- --- search_tarif: tambah rumah_sakit_display + kelompok ---------
create or replace function build_order_by(sort text)
returns text language plpgsql immutable as $$
declare
  allowed jsonb := '{
    "tahun":"t.tahun","rumah_sakit":"rumah_sakit_display","kelompok":"kelompok",
    "kategori_harga":"t.kategori_harga","nama_layanan":"t.nama_layanan",
    "kelas_kamar":"t.kelas_kamar","tarif":"t.tarif","pct_increase":"pct_increase"}';
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
  if not ('t.nama_layanan' = any(used)) then parts := parts || 't.nama_layanan asc';  end if;
  if not ('t.tarif'        = any(used)) then parts := parts || 't.tarif desc';         end if;
  return array_to_string(parts, ', ');
end $$;

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
  rumah_sakit text, rumah_sakit_display text, kelompok text,
  tahun int, pct_increase numeric, total_count bigint
)
language plpgsql stable as $$
declare
  v_offset int  := (greatest(page, 1) - 1) * page_size;
  v_order  text := build_order_by(sort);
begin
  return query execute
    $q$
    select t.kategori_harga::text, t.nama_layanan::text, t.kelas_kamar::text,
           t.tarif::numeric, t.rumah_sakit::text,
           coalesce(rs.display_name, t.rumah_sakit)::text as rumah_sakit_display,
           (case when rs.group_non_group ilike 'group' then rs.nama_group else 'Non-Group' end)::text as kelompok,
           t.tahun::int,
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
    left join rumahsakit rs on rs.rumah_sakit = t.rumah_sakit
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

-- --- get_filters: tambah rumah_sakit_info -------------------------
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
                    from (select distinct kelas_kamar, rumah_sakit from tarif where kelas_kamar is not null) x),
    'rumah_sakit_info', (select coalesce(jsonb_agg(jsonb_build_object(
                            'rumah_sakit', t.r,
                            'display_name', coalesce(rs.display_name, t.r),
                            'kelompok', case when rs.group_non_group ilike 'group' then rs.nama_group else 'Non-Group' end
                          ) order by t.r), '[]')
                         from (select distinct rumah_sakit r from tarif) t
                         left join rumahsakit rs on rs.rumah_sakit = t.r)
  );
$$;

grant execute on function search_tarif to anon;
grant execute on function get_filters  to anon;

analyze tarif;
analyze rumahsakit;
