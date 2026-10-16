-- ============================================================
-- tariff-book shard: shard_stats() (run 3rd)
-- ============================================================
-- Database size and the hospitals stored on this shard, with row counts.
-- Used by the keep-alive Worker (daily ping) and by people deciding where a
-- new hospital should go:  select shard_stats();
-- ============================================================

create or replace function shard_stats()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'db_size',       pg_size_pretty(pg_database_size(current_database())),
    'hospitals', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'rumah_sakit', rs.nama,
               'display_name', r.display_name,
               'rows', c.n) order by c.n desc), '[]')
      from (select rumah_sakit_id, count(*) as n from tarif_v2 group by rumah_sakit_id) c
      join rumah_sakit_ref rs on rs.id = c.rumah_sakit_id
      left join rumahsakit r on r.rumah_sakit = rs.nama
    )
  );
$$;
