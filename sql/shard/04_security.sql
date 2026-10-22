-- ============================================================
-- tariff-book shard: RLS policies and grants (run 4th)
-- ============================================================
-- Run in the Supabase SQL Editor (role: postgres) on every shard.
-- Idempotent. The API uses the ANON key, which RESPECTS RLS: a table with
-- RLS on and no read policy silently returns 0 rows. Each policy is created
-- before RLS is switched on, so reads never break mid-run.
-- Upload / move scripts connect as postgres (DATABASE_URL), which bypasses
-- RLS, so they are unaffected.
-- ============================================================

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'tarif_v2', 'rumah_sakit_ref', 'kategori_ref', 'kelas_kamar_ref',
    'layanan_ref', 'rumahsakit', 'room_class_mapping', 'filters_cache'
  ] loop
    execute format('drop policy if exists %I on %I', 'public read ' || tbl, tbl);
    execute format('create policy %I on %I for select to anon using (true)', 'public read ' || tbl, tbl);
    execute format('alter table %I enable row level security', tbl);
  end loop;
end $$;

-- --- anon must be able to EXECUTE the RPCs ----------------------
grant execute on function search_tarif        to anon;
grant execute on function suggest_tarif       to anon;
grant execute on function compare_rows_tarif  to anon;
grant execute on function get_filters         to anon;
grant execute on function kenaikan_tarif      to anon;
grant execute on function shard_stats         to anon;

-- refresh_filters rewrites the cache and reads the whole table: only the
-- upload/move scripts (service_role) and the SQL Editor (postgres) run it.
revoke execute on function refresh_filters from public, anon, authenticated;
grant  execute on function refresh_filters to service_role;

-- --- anon reads (Supabase grants these by default; explicit here so the
-- RPCs never depend on that default) ------------------------------
grant select on tarif_v2, rumah_sakit_ref, kategori_ref, kelas_kamar_ref,
                layanan_ref, rumahsakit, room_class_mapping, tarif, filters_cache to anon;
