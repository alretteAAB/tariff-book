-- ============================================================
-- tariff-book golongan project: read-only access for the website (run 3rd)
-- ============================================================
-- The website uses the publishable/anon key: it may read, never write.
-- The upload script uses the service_role key, which bypasses RLS.
-- ============================================================

drop policy if exists "public read golongan_operasi" on golongan_operasi;
create policy "public read golongan_operasi" on golongan_operasi for select to anon using (true);
alter table golongan_operasi enable row level security;

revoke insert, update, delete, truncate on golongan_operasi from anon, authenticated;
grant select on golongan_operasi to anon;

grant execute on function search_golongan      to anon;
grant execute on function get_golongan_filters to anon;
grant execute on function shard_stats          to anon;
