# Runbook: free up space on a shard after moving hospitals out

`DELETE` does not make the database file smaller, and Supabase counts the
file size against the 500 MB free quota. The space only comes back after
`VACUUM FULL`, which rewrites the table into a new file. While that runs, the
old and new copies exist side by side, so it needs free space roughly equal to
what remains of the table. Dropping the secondary indexes first (about 230 MB of
the 391 MB on shard 1) makes that room. Rebuild them at the end.

**Effect on the app:** while the indexes are gone, searches on this shard are
slow or time out, and `VACUUM FULL` locks `tarif_v2` (reads wait). Do this
outside working hours. It takes minutes, not hours, at this table size.

## 0. Before you start

- [ ] Backup: `pg_dump "$DATABASE_URL_1" -Fc -t tarif_v2 -t '*_ref' -t rumahsakit -t room_class_mapping > shard1.dump`
      (or keep a backup table, e.g. `create table tarif_v2_backup_YYYYMMDD as table tarif_v2;`; note that a
      backup table inside the same database uses quota too).
- [ ] Every hospital you moved has run through `scripts/move-hospital.js ... --delete`,
      and `select shard_stats();` on both shards shows the expected counts.
- [ ] Run this from `psql` with the shard's `DATABASE_URL`
      (`psql "$DATABASE_URL_1" -f ...` or paste step by step). The Supabase SQL Editor can
      cut long statements off; if you use it, run one step at a time.

## 1. Size before

```sql
select pg_size_pretty(pg_database_size(current_database())) as db,
       pg_size_pretty(pg_total_relation_size('tarif_v2'))   as tarif_v2,
       pg_size_pretty(pg_total_relation_size('layanan_ref')) as layanan_ref;
```

## 2. Remove reference rows no hospital on this shard uses any more

Run this while the indexes still exist (the lookups use them).

```sql
set statement_timeout = 0;
delete from layanan_ref l     where not exists (select 1 from tarif_v2 t where t.layanan_id     = l.id);
delete from kategori_ref k    where not exists (select 1 from tarif_v2 t where t.kategori_id    = k.id);
delete from kelas_kamar_ref k where not exists (select 1 from tarif_v2 t where t.kelas_kamar_id = k.id);
```

## 3. Drop the secondary indexes (keep the primary key)

```sql
drop index if exists idx_tarif_v2_join, idx_tarif_v2_tahun, idx_tarif_v2_rs,
                      idx_tarif_v2_kategori, idx_tarif_v2_kelas;
alter table tarif_v2 drop constraint if exists tarif_v2_unique_combo;
```

## 4. Rewrite the tables

```sql
set statement_timeout = 0;
vacuum full tarif_v2;
vacuum full layanan_ref;
vacuum full kategori_ref;
vacuum full kelas_kamar_ref;
```

## 5. Rebuild the indexes

```sql
set statement_timeout = 0;
alter table tarif_v2 add constraint tarif_v2_unique_combo
  unique (rumah_sakit_id, kategori_id, kelas_kamar_id, layanan_id, tahun, tarif);
create index if not exists idx_tarif_v2_join     on tarif_v2 (layanan_id, kategori_id, kelas_kamar_id, tahun);
create index if not exists idx_tarif_v2_tahun    on tarif_v2 (tahun);
create index if not exists idx_tarif_v2_rs       on tarif_v2 (rumah_sakit_id);
create index if not exists idx_tarif_v2_kategori on tarif_v2 (kategori_id);
create index if not exists idx_tarif_v2_kelas    on tarif_v2 (kelas_kamar_id);
analyze tarif_v2;
```

(Re-running `sql/shard/01_schema.sql` also recreates the indexes, but not
the unique constraint, so run the `alter table` above either way.)

## 6. Check

```sql
select pg_size_pretty(pg_database_size(current_database()));
select indexname from pg_indexes where tablename = 'tarif_v2' order by 1;
-- expect: idx_tarif_v2_join, _kategori, _kelas, _rs, _tahun, tarif_v2_pkey, tarif_v2_unique_combo
select shard_stats();
```

Then open the app and search a hospital that stayed on this shard.

## If it fails halfway

- Fails in step 4 (out of space): the old table is still intact. Delete more
  (or move another hospital out first), then retry step 4.
- Anything after step 3: the data is fine, only indexes are missing. Run
  step 5; the app is slow until it completes.
