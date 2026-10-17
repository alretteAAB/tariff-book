-- ============================================================
-- tariff-book shard: reject duplicate rows, empty columns included (run 5th)
-- ============================================================
-- tarif_v2_unique_combo blocks a row whose six columns all match an existing
-- row. But a plain UNIQUE treats NULL as "unknown", so two rows with an empty
-- kelas_kamar (or tahun/tarif) never count as equal: uploading the same CSV
-- twice duplicated exactly those rows. NULLS NOT DISTINCT (Postgres 15+)
-- makes empty values count as equal, so a repeated upload is skipped.
--
-- Run in the Supabase SQL Editor (role: postgres) on every EXISTING shard.
-- New shards already get this from 01_schema.sql. Safe to re-run: when the
-- constraint is already strict nothing happens.
--
-- Step A is read-only: run it first to see what step B will delete.
-- Step B removes the extra copies (the oldest row of each group, lowest id,
-- stays) and swaps the constraint, in one transaction: if anything fails,
-- nothing changes. It rebuilds one index (~96 MB on shard 1); expect up to a
-- minute or two, and searches may wait briefly while it runs.
-- ============================================================

-- ---- Step A: preview (read-only) -------------------------------
select count(*) as extra_copies_to_delete
from (
  select row_number() over (
           partition by rumah_sakit_id, kategori_id, kelas_kamar_id, layanan_id, tahun, tarif
           order by id) as rn
  from tarif_v2
  where rumah_sakit_id is null or kategori_id is null or kelas_kamar_id is null
     or layanan_id is null or tahun is null or tarif is null
) d
where rn > 1;

-- ---- Step B: deduplicate + strict constraint --------------------
begin;
set local statement_timeout = 0;

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_index i on i.indexrelid = c.conindid
    where c.conname = 'tarif_v2_unique_combo' and i.indnullsnotdistinct
  ) then
    raise notice 'tarif_v2_unique_combo is already NULLS NOT DISTINCT, nothing to do';
    return;
  end if;

  -- Only rows with an empty column can be duplicates: the old constraint
  -- already blocked exact copies without NULLs.
  delete from tarif_v2
  where id in (
    select id from (
      select id, row_number() over (
               partition by rumah_sakit_id, kategori_id, kelas_kamar_id, layanan_id, tahun, tarif
               order by id) as rn
      from tarif_v2
      where rumah_sakit_id is null or kategori_id is null or kelas_kamar_id is null
         or layanan_id is null or tahun is null or tarif is null
    ) d
    where rn > 1
  );

  alter table tarif_v2 drop constraint if exists tarif_v2_unique_combo;
  alter table tarif_v2 add constraint tarif_v2_unique_combo
    unique nulls not distinct (rumah_sakit_id, kategori_id, kelas_kamar_id, layanan_id, tahun, tarif);
end $$;

commit;

-- Check: expect 'UNIQUE NULLS NOT DISTINCT (...)'
select pg_get_constraintdef(oid) from pg_constraint where conname = 'tarif_v2_unique_combo';
