# Shard guide: adding shards, uploading data, day-to-day care
Trigger Deployment

A **shard** is one Supabase project holding some of the hospitals. Shard 1
is the project you already have (`wxixsguicwznoxgllfbo`). The website asks
every shard and combines the answers, so users never see the split.

Rule that everything follows: **one hospital lives entirely on one shard**
(all its years together, because `% vs tahun lalu` compares each year with the
previous one inside one database). The scripts enforce this for you.

---

## 1. Create a new shard and connect it

### 1.1 Create the Supabase project
1. In Supabase, **New project**. Use the same region as shard 1 (e.g. Southeast
   Asia / Singapore), so both answer equally fast.
2. Save the **database password** in your password manager. You need it once
   for the connection string.
3. Free plan: about 2 active projects per account. If you need another account
   for more shards, read the Supabase terms first.

### 1.2 Create the tables and functions
In the new project, **SQL Editor**: open each file from `sql/shard/`, paste,
and **Run**, in this order:

| # | File | What it does |
| - | ---- | ------------ |
| 1 | `01_schema.sql` | tables, `tarif` view, indexes |
| 2 | `02_rpc.sql` | search / suggest / compare / filters functions |
| 3 | `03_shard_stats.sql` | `shard_stats()` (size + hospitals) |
| 4 | `04_security.sql` | read-only access for the website (RLS + grants) |

`05_strict_unique.sql` is only for shards created before it existed (shard 1,
and shard 2 if it was set up before October 17, 2026): it removes duplicate
rows with empty columns and makes the database reject them from then on. New
shards get this from `01_schema.sql`.

Check: `select shard_stats();` returns `"hospitals": []` and a small `db_size`.

`room_class_mapping` (room class names) does not need copying by hand: the
upload script and the move script copy it from shard 1 automatically.

### 1.3 Collect the keys (Supabase, Project Settings)
| What | Where | Used by |
| ---- | ----- | ------- |
| Project URL `https://xxxx.supabase.co` | API | website, keep-alive, upload |
| **anon** key, legacy JWT format `eyJ…` | API → legacy keys | website, keep-alive |
| **service_role** key `eyJ…` | API → legacy keys | upload script only (on your laptop) |
| Connection string (Session pooler, port 5432) | Connect button | move script only |

The service_role key and the connection string can change anything. Keep them
only in `scripts/.env` on your laptop (git ignores that file). Never put them in
Cloudflare, the code, or a chat.

### 1.4 Tell the website about it (Cloudflare Pages)
Cloudflare → Workers & Pages → **tariff-book** → Settings → **Variables and
Secrets**. Set these for **Production** and for **Preview**:

| Name | Value |
| ---- | ----- |
| `SHARDS` | `1,2` (list every shard) |
| `SHARD_1_URL` | `https://wxixsguicwznoxgllfbo.supabase.co` |
| `SHARD_1_KEY` | shard 1 anon key (type: Secret) |
| `SHARD_2_URL` | the new project URL |
| `SHARD_2_KEY` | the new anon key (type: Secret) |

The first time you add `SHARDS`, the old `SUPABASE_URL` / `SUPABASE_ANON_KEY`
stop being used (you can delete them afterwards).

**Environment variables only apply to new deployments.** After saving, go to
Deployments → latest production deployment → ⋯ → **Retry deployment**.

### 1.5 Keep it awake (keep-alive Worker)
Free Supabase projects pause after about a week without activity. The
keep-alive Worker pings every shard daily.

```bash
cd workers/keepalive
# edit wrangler.jsonc: "SHARDS": "1,2" and add "SHARD_2_URL": "https://xxxx.supabase.co"
npx wrangler login                 # once
npx wrangler secret put SHARD_1_KEY   # paste shard 1 anon key
npx wrangler secret put SHARD_2_KEY   # paste shard 2 anon key
npx wrangler deploy
```
Check: Cloudflare → Workers → tariff-book-keepalive → Logs (after the next
03:17 UTC run), or trigger it from the dashboard. Every shard should show
`shard n: … MB, … hospitals`.

### 1.6 Tell the scripts about it
In `scripts/.env` (copy from `scripts/.env.example`):
```
SHARDS=1,2
SHARD_2_URL=https://xxxx.supabase.co
SHARD_2_SERVICE_KEY=eyJ...
DATABASE_URL_2=postgresql://postgres.xxxx:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

### 1.7 Check
- `https://tariff-book.pages.dev/api/filters` still lists every hospital and has
  **no** `"partial": true` (that would mean a shard is not reachable; check
  the URL/key for that shard).
- Search something on the site.

A new empty shard changes nothing for users until data goes into it, either
new hospitals (section 2) or hospitals moved from shard 1 (section 3.1).

---

## 2. Add data

### 2.1 Once: install
```bash
cd scripts
pip install -r requirements.txt
cp .env.example .env     # then fill SHARDS, SHARD_n_URL, SHARD_n_SERVICE_KEY
```

### 2.2 The CSV
Columns (same as before):
`rumah_sakit, group_non_group, nama_group, kategori_harga, nama_layanan,
kelas_kamar, tahun, tarif, pct_increase` (`pct_increase` may be empty; the
website calculates % vs last year itself).

`rumah_sakit` must be spelled **exactly** as the hospital already exists
(`select shard_stats();` lists the names), otherwise it becomes a new
hospital.

### 2.3 Dry run first
```bash
python upload_tarif.py data_tarif_baru.csv --dry-run
```
It prints every shard's size and the plan:
```
shard 1  tambah     1200 baris  Rs Ngoerah          <- existing hospital, stays on its shard
shard 2  baru      35000 baris  RS Contoh Baru      <- new hospital, goes where there is most room
```
If something does not fit, it stops and says why, and **nothing is written**.
Then create a shard (section 1) or move a hospital out (section 3.1) and try again.

### 2.4 Upload
```bash
python upload_tarif.py data_tarif_baru.csv
```
Per hospital it shows `[1/3] RS ... -> shard 2` and two progress bars with the
time left: **Mencocokkan nama** (looking up / creating the ids of new service,
category and room-class names; slow for a hospital with thousands of new names)
and **Mengirim baris** (sending the rows). At the end it prints the total time and
the row count per hospital. Compare with your CSV.

### 2.5 After uploading
- New hospitals appear in the dropdown and in search right away. (Only after
  **moving** a hospital can a hospital-filtered search miss it for up to 5
  minutes, while the site's hospital→shard cache refreshes.)
- New hospitals get `display_name` = the raw name. To tidy it (e.g.
  `Rs Contoh` → `RS Contoh`), edit the `rumahsakit` table on **that hospital's
  shard** (Table Editor). Re-uploads never overwrite your edit.
- Interrupted, or ran it twice? Run the same command again: rows that are
  already there are skipped by the database itself (also rows with an empty
  `kelas_kamar`, once `05_strict_unique.sql` has run on that shard). The
  dry run shows how many rows each hospital already has.

---

## 3. Other things to know

### 3.1 Moving a hospital to another shard (to free space)
```bash
cd scripts && npm install          # once
node move-hospital.js --from 1 --to 2 --rs "Rs Ngoerah"            # copy + verify
node move-hospital.js --from 1 --to 2 --rs "Rs Ngoerah" --delete   # remove from shard 1
```
- Backup first (`pg_dump`, see the runbook).
- Between the two commands the hospital exists twice and shows double rows on
  the site, so run `--delete` right after checking.
- Move duplicate pairs together: `RS Siloam Jantung Diagram` + `Rs Siloam Jantung
  Diagram`, and `RS Siloam Baubau` + `Rs Siloam Baubau` (several `--rs` in one command).
- **Deleting does not shrink the database.** Follow
  `sql/shard/runbook-reclaim-space.md` afterwards (outside working hours).

### 3.2 Watch the space
- `select shard_stats();` on each shard. Free limit is 500 MB per project; the
  upload script keeps 50 MB spare. Shard 1 is at ~447 MB, so only about
  200k more rows fit there: put new hospitals on a new shard.
- Rough sizing: 1 million rows ≈ 250 MB, so plan one shard per ~1.7M rows.

### 3.3 When a shard is down or paused
The site keeps working with the other shards; results from the missing shard
are simply absent (the page shows no warning). `/api/filters` then contains
`"partial": true, "failedShards": ["2"]`. Fix: in Supabase, restore the
paused project, and check the keep-alive Worker logs.

### 3.4 Changing the SQL functions
Edit the file in `sql/shard/`, then run it on **every** shard. If you re-run
`02_rpc.sql`, always run `04_security.sql` right after it.

### 3.4b The filter list is cached
The dropdown lists (hospitals, categories, years, room classes) are stored in
the `filters_cache` table of each shard instead of being recomputed from all
rows on every page load. `upload_tarif.py` and `move-hospital.js` refresh it
when they finish. If you change data any other way (SQL Editor, Table Editor,
an old script), run this on that shard afterwards:
```sql
select refresh_filters();
```
Browsers also keep the list for up to 5 minutes, so new hospitals can take
that long to appear in the dropdown for someone who already had the page open.

### 3.4c The Kenaikan Harga tab
It needs `kenaikan_tarif`, `selisih_kelas_tarif` and the `rs_tahun` list from
`02_rpc.sql` + `04_security.sql` on every shard, then `select refresh_filters();`
there. Until then the tab says the year list is not available (or the class
section shows an error if only `selisih_kelas_tarif` is missing).

The tab shows one hospital: price increase between years (needs 2+ years) and
the price difference between room classes in one year, each class against a
base class (default: the one named like "Kelas II").

The 5 kategori besar come from the Excel mapping, stored in the code as
`frontend/functions/api/_kategori_besar.json`. To change the mapping:
```bash
cd scripts && pip install -r requirements.txt
python build_kategori_besar.py mapping_kategori_besar.xlsx
```
then commit the JSON and deploy. Names must match `kategori_harga` exactly
(spaces and capitals count); categories not in the file are left out of the
dashboard and shown as "Tidak termasuk 5 kategori".

### 3.5 Known limits
- Results that span several shards stop at **100 pages** (5,000 rows). Filter by
  hospital or year to see more; exports still go up to 50,000 rows.
- Sorting text across shards can differ slightly from a single database for
  names with unusual punctuation.
- `% vs tahun lalu` is calculated when you search, nothing to run after an
  upload: each row against the same item (same hospital, service, category and
  room class) in the year before. A year with no data for the year before shows
  "—".
- Backups: the free plan has no point-in-time restore. `pg_dump` before any
  move or cleanup.

### 3.6 If a key leaks
Supabase → Project Settings → API → roll the key. Then update it where it is
used (Cloudflare variables + Retry deployment, keep-alive secret, `scripts/.env`).

---

## 4. The golongan operasi project

The "Golongan Operasi" tab has its own Supabase project. It is not a shard:
it is not in `SHARDS`, and the hospital rules above do not apply to it.

### 4.1 Set it up (once)
1. New Supabase project (same region as the shards). Save the DB password.
2. SQL Editor, in this order: `sql/golongan/01_schema.sql`,
   `sql/golongan/02_rpc.sql`, `sql/golongan/03_security.sql`.
   Check: `select shard_stats();` returns `"hospitals": []`.
3. `scripts/.env`:
   ```
   GOLONGAN_URL=https://xxxx.supabase.co
   GOLONGAN_SERVICE_KEY=eyJ...      (service_role, tab Legacy)
   ```
4. Upload the golongan CSVs (format in 4.2). The original two books
   (Mitra Keluarga Bekasi Timur, 2198 rows; Grand Wisata, 1332 rows) were
   uploaded on 2026-10-20; their CSVs are no longer in the repo (in git
   history before that date, and kept outside the repo as a backup).
   ```bash
   cd scripts
   python upload_golongan.py buku_golongan_rs_a.csv buku_golongan_rs_b.csv --dry-run
   python upload_golongan.py buku_golongan_rs_a.csv buku_golongan_rs_b.csv
   ```
5. Cloudflare Pages → Settings → Variables and Secrets, **Preview and
   Production**: `GOLONGAN_URL` = the project URL, `GOLONGAN_KEY` = its
   publishable (or legacy anon) key. Then **Retry deployment**.
6. Check `https://…pages.dev/api/golongan/filters` (lists of hospitals,
   specialties, golongan) and open the Golongan Operasi tab.
7. Keep-alive: add `"GOLONGAN_URL"` to `workers/keepalive/wrangler.jsonc`
   vars, `npx wrangler secret put GOLONGAN_KEY`, `npx wrangler deploy`.

### 4.2 Add a hospital's golongan book
CSV columns: `rumah_sakit, specialty, golongan, nama_layanan` and optionally
`service_code`. A leading `OPERASI ` in golongan is removed automatically.
Golongan values outside KECIL / SEDANG(1-3) / BESAR 1-3 / KHUSUS 1-3 are
listed in the dry run (they sort last). Uploading the same file again adds
nothing (the database rejects identical rows).
```bash
python upload_golongan.py buku_golongan_rs_baru.csv --dry-run
python upload_golongan.py buku_golongan_rs_baru.csv
```
New data shows on the site right away; no deploy needed.
