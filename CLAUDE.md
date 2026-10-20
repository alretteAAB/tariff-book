# CLAUDE.md — tariff-book

Hospital tariff search app. Stakeholders search ~2M rows of tariff data by
service name + filters (category, hospital, year, room class), and export or
compare the results.

## Architecture

- `frontend/` — Vite + React SPA on **Cloudflare Pages** (`tariff-book.pages.dev`).
  The API lives in the same project under `frontend/functions/api/*`
  (Pages Functions), so the SPA calls same-origin `/api/*` (`API = "/api"` in
  `frontend/src/lib/utils.jsx`). No separate server: the work network blocks
  third-party hosts, Cloudflare it does not.
- Data: **Supabase Postgres**, split into **shards** (one Supabase project
  each, identical schema). One hospital lives entirely on one shard, because
  `pct_increase` compares 2026 with 2025 rows inside a database.
- Functions talk to Supabase over HTTPS with `@supabase/supabase-js` and the
  **anon** key. All heavy SQL (trigram fuzzy search, `pct_increase`
  self-join, `DISTINCT ON`, dynamic sort) is in Postgres functions (RPC);
  the Functions are thin wrappers plus the cross-shard merge.

```
frontend/functions/api/
  _supabase.js   parseMulti(), json()                       (no route)
  _shards.js     shard registry, hospital→shard map, fan-out (no route)
  _merge.js      pure merge helpers: sort comparator, suggest/filters merge
  filters.js  search.js  suggest.js  export.js  compare.js   → /api/<name>
  _golongan.js   client for the golongan project (GOLONGAN_URL / GOLONGAN_KEY)
  golongan/index.js  golongan/filters.js   → /api/golongan, /api/golongan/filters
frontend/test/merge.test.js   npm test (node --test)
sql/shard/        01_schema → 02_rpc → 03_shard_stats → 04_security (run in order)
                  05_strict_unique: one-off for shards created before it (01 has it built in)
sql/shard/runbook-reclaim-space.md
scripts/upload_tarif.py       CSV upload; picks the shard per hospital (SHARD_n_SERVICE_KEY)
scripts/move-hospital.js      move hospitals between shards (needs DATABASE_URL_n)
sql/golongan/     01_schema → 02_rpc → 03_security  (golongan operasi project)
scripts/upload_golongan.py    CSV upload of golongan operasi (GOLONGAN_SERVICE_KEY)
data/golongan_operasi*.csv    source CSVs of the golongan data (initial upload)
workers/keepalive/            cron Worker: daily shard_stats() ping per shard
docs/shard-guide.md           how-to for humans: new shard, uploading, moving, limits
```

## Database (per shard)

`tarif_v2` (fact table: `rumah_sakit_id, kategori_id, kelas_kamar_id,
layanan_id, tahun, tarif, pct_increase`) + `rumah_sakit_ref`, `kategori_ref`,
`kelas_kamar_ref`, `layanan_ref` (id ↔ nama). The `tarif` **view** joins them
back to text columns; all RPCs read the view. `rumahsakit` holds
`display_name` / `nama_group` (joined on `rumah_sakit = rumah_sakit_ref.nama`),
`room_class_mapping` normalizes room classes (same content on every shard).

RPCs (args must match exactly): `search_tarif(q, f_kategori, f_rumah_sakit,
f_tahun, f_kelas, sort, page, page_size)`, `suggest_tarif(q, f_*)` (returns
`score` too), `compare_rows_tarif(q, f_*, row_limit)`, `get_filters()`,
`shard_stats()`.

**`sql/shard/*.sql` is the source of truth.** Change SQL there first, then run
it on every shard. Re-running `02_rpc.sql` drops/recreates `suggest_tarif`, so
always run `04_security.sql` after it (grants).

Reference ids and `tarif_v2.id` are local to each shard (identity columns);
tooling that copies rows re-links by name and lets the target assign ids.

## Sharding

Env vars in Cloudflare Pages (**Production and Preview**), never committed:

| Name | Value |
| --- | --- |
| `SHARDS` | `1,2,…` |
| `SHARD_n_URL` | `https://<project>.supabase.co` |
| `SHARD_n_KEY` | that project's **legacy anon** key (`eyJ…`) |

Without `SHARDS`, `SUPABASE_URL` / `SUPABASE_ANON_KEY` act as shard `1`.
Adding a shard needs no code change.

How the router behaves (`_shards.js`):
- Hospital → shard map comes from each shard's `get_filters().relations`,
  cached ~5 min per isolate. A `rumah_sakit` filter goes only to the shards
  holding those hospitals; no filter or an unknown name → all shards.
- One shard involved → the request is forwarded as-is (same as single DB).
- Several shards: `search` asks each for the top `page*50` rows, merges with
  a comparator that mirrors `build_order_by`, sums `total_count`; capped at
  100 pages (`totalPages` never exceeds it). `suggest` merges by `score`,
  dedupes names. `filters` unions. `export` merges up to 50k rows. `compare`
  pivots the combined rows (max 10k raw rows in total).
- A failing shard does not fail the request: JSON gets `partial: true,
  failedShards: [...]`, exports get header `x-partial-shards`. All shards
  failing → 500.

## Golongan operasi project

The "Golongan Operasi" tab reads a separate Supabase project (not a tarif
shard, not in `SHARDS`): table `golongan_operasi(rumah_sakit, specialty,
golongan, service_code, nama_layanan)`, RPCs `search_golongan(q,
f_rumah_sakit, f_specialty, f_golongan, sort, page, page_size)`,
`get_golongan_filters()`, `shard_stats()`. Search, filters, sort and paging
run in the database; golongan sorts by tier (`golongan_rank`: KECIL → SEDANG →
BESAR → KHUSUS), text sorts with the ICU `id` collation `golongan_id` so the
order matches the browser's old `localeCompare('id')`.
Env in Cloudflare Pages (Production and Preview): `GOLONGAN_URL`,
`GOLONGAN_KEY` (publishable/anon key). Missing env → `/api/golongan` returns
500 with the variable names. The keep-alive Worker pings it when
`GOLONGAN_URL` is set.

## Commands

```bash
cd frontend && npm install && npm run build   # Pages build (root: frontend, output: dist)
cd frontend && npm test                       # merge helper unit tests
cd frontend && npx wrangler pages functions build --outdir /tmp/fn   # check Functions bundle
cd scripts && pip install -r requirements.txt && python upload_tarif.py data.csv --dry-run
cd scripts && npm install && node move-hospital.js --from 1 --to 2 --rs "Nama RS" [--delete]
cd scripts && python upload_golongan.py ../data/golongan_operasi.csv ../data/golongan_operasi_grand_wisata.csv --dry-run
cd workers/keepalive && npx wrangler secret put SHARD_1_KEY && npx wrangler deploy
```

Cloudflare Pages build settings: root `frontend`, build command
`npm install && npm run build` (not `npm ci`), output `dist`.

## Gotchas

- **RLS:** the anon key respects RLS. Every table needs the `public read …`
  policy from `04_security.sql`, or queries return 0 rows without error.
- **Uploads:** `upload_tarif.py` keeps a hospital on the shard that already
  has it; new hospitals go to the shard with the most room (estimate: 260
  bytes/row, 50 MB headroom under 500 MB). It never overwrites an existing
  `rumahsakit.display_name`. Re-running skips identical rows: the database
  rejects them via `tarif_v2_unique_combo`, which is `UNIQUE NULLS NOT
  DISTINCT` so rows with an empty `kelas_kamar` count as duplicates too
  (`05_strict_unique.sql` converts shards created before that).
- **`pg` does not run on the Workers runtime.** Functions use supabase-js only;
  `pg` is for `scripts/` on your machine.
- **Underscore files** in `functions/api/` export no handlers, so they are not routes.
- **DELETE does not shrink the database.** After moving hospitals out, follow
  `sql/shard/runbook-reclaim-space.md` (drop indexes → VACUUM FULL → rebuild).
- **Text order:** multi-shard merges compare text with `Intl.Collator('en')`;
  Postgres uses the DB collation. Ordinary names agree; odd punctuation can
  order slightly differently than a single database would.
- **`pct_increase` join** matches service, category and room class but not the
  hospital, so within one shard a 2026 row can pick up another hospital's 2025
  price. Moving hospitals to different shards changes which matches exist.
- **Free-plan pause:** keep `workers/keepalive` deployed with every shard
  listed in its `SHARDS` var and `SHARD_n_KEY` secrets.
- Statement timeouts on ~2M rows were fixed by the indexes in `01_schema.sql`.
  Keep them.
