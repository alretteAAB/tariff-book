# CLAUDE.md — Tariff Book Migration

## Project Overview
A hospital tariff search app. Currently has a separate Express + pg backend. Goal is to eliminate the backend entirely and move all API logic into **Cloudflare Pages Functions** using the **Supabase JS client**. Everything should live on Cloudflare so it's safe from corporate network blocks.

## Current Stack
- **Frontend**: React + Vite (in `/frontend`)
- **Backend**: Express + node-postgres `pg` (in `/backend`) — THIS WILL BE DELETED
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Cloudflare Pages (frontend), backend not deployed yet

## Target Stack
- **Frontend**: React + Vite — stays the same
- **API**: Cloudflare Pages Functions (in `/frontend/functions/api/`)
- **Database**: Supabase via `@supabase/supabase-js` client
- **Hosting**: Everything on Cloudflare Pages

---

## What To Do

### 1. Delete the backend folder
The entire `/backend` folder is no longer needed. Delete it.

### 2. Install Supabase client in frontend
```bash
cd frontend
npm install @supabase/supabase-js
```

### 3. Create the functions folder
Create this structure inside `/frontend`:
```
frontend/
└── functions/
    └── api/
        ├── filters.js
        ├── search.js
        └── suggest.js
```

### 4. Migrate each endpoint

All functions follow this pattern:
- Import `createClient` from `@supabase/supabase-js`
- Read `env.SUPABASE_URL` and `env.SUPABASE_ANON_KEY` from Cloudflare env
- Parse query params from `request.url`
- Return `Response.json(...)`

**Helper used in all files — parse multi-value params** (e.g. `?kategori=A,B` or `?kategori=A&kategori=B`):
```js
function parseMulti(url, key) {
  const vals = url.searchParams.getAll(key)
  return vals.flatMap(v => v.split(',').map(s => s.trim()).filter(Boolean))
}
```

---

#### `functions/api/filters.js`
Replaces `GET /filters`.

Fetch these using Supabase, each as a separate `.select()` with distinct values:
- `kategori_harga` distinct from `tarif`, sorted ASC
- `rumah_sakit` distinct from `tarif`, sorted ASC
- `tahun` distinct from `tarif`, sorted DESC
- `kelas_kamar` distinct from `tarif` where not null, sorted ASC
- `relations`: distinct pairs of `{ kategori_harga, rumah_sakit }`
- `kelas_relations`: distinct pairs of `{ kelas_kamar, rumah_sakit }` where kelas_kamar not null

Return shape:
```json
{
  "kategori": [...],
  "rumah_sakit": [...],
  "tahun": [...],
  "kelas_kamar": [...],
  "relations": [{ "kategori_harga": "...", "rumah_sakit": "..." }],
  "kelas_relations": [{ "kelas_kamar": "...", "rumah_sakit": "..." }]
}
```

> Note: Supabase doesn't have a native DISTINCT query builder for multiple columns. Use `.select('kategori_harga, rumah_sakit')` and deduplicate in JS if needed, or create a Postgres view/function in Supabase for the relations queries.

---

#### `functions/api/search.js`
Replaces `GET /search`.

Query params:
- `q` — search string, matched with ILIKE on `nama_layanan`
- `kategori` — multi-value, filter with `.in()`
- `rumah_sakit` — multi-value, filter with `.in()`
- `tahun` — multi-value of numbers, filter with `.in()`
- `kelas_kamar` — multi-value, filter with `.in()`
- `page` — pagination, default 1
- `sort` — `'asc'` or `'desc'` for `tarif` column, default DESC

If no `q` and no filters provided, return `{ data: [], total: 0, page: 1, totalPages: 0 }`.

Page size: 50 rows. Use `.range(offset, offset + PAGE_SIZE - 1)`.

Select columns: `kategori_harga, nama_layanan, kelas_kamar, tarif, rumah_sakit, tahun`

Order: `nama_layanan ASC`, then `tarif ASC/DESC` based on sort param.

Return shape:
```json
{
  "data": [...],
  "total": 123,
  "page": 1,
  "totalPages": 3
}
```

---

#### `functions/api/suggest.js`
Replaces `GET /suggest`.

Query params:
- `q` — required, return `[]` if empty
- Same optional filters as `/search`

Query: ILIKE on `nama_layanan`, select distinct `nama_layanan` and `kategori_harga`, limit 6.

> Supabase doesn't support `DISTINCT ON` in the JS client. Use `.select('nama_layanan, kategori_harga').ilike(...).limit(6)` and deduplicate by `nama_layanan` in JS after fetching.

Return shape:
```json
[
  { "nama_layanan": "...", "kategori_harga": "..." }
]
```

---

### 5. Update frontend API calls
In the React frontend, all `fetch()` calls to the backend should be updated:
- Old: `http://localhost:3000/search?...`
- New: `/api/search?...` (relative URL, Cloudflare Pages routes `/api/*` to functions automatically)

Check `App.jsx` and any other files making API calls and update them.

---

### 6. Update `.env.example` in frontend
Replace the old backend URL env var with:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> The functions themselves read `env.SUPABASE_URL` and `env.SUPABASE_ANON_KEY` from Cloudflare's environment — set these in Cloudflare Pages dashboard under Settings → Environment Variables.

---

### 7. Update vite.config.js (for local dev)
To proxy `/api/*` calls locally during development, add this to `vite.config.js`:
```js
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8788', // wrangler dev port
      changeOrigin: true
    }
  }
}
```

For local dev of Pages Functions, use:
```bash
npx wrangler pages dev ./dist --port 8788
```
(build first with `npm run build`, then run wrangler)

---

### 8. Delete `/backend` folder
Once all endpoints are migrated and tested, delete the entire `/backend` directory.

---

## CORS
No CORS config needed — frontend and functions are on the same domain in Cloudflare Pages.

## Error handling
All functions should catch errors and return:
```js
return Response.json({ error: error.message }, { status: 500 })
```

## Do NOT
- Use `express`, `cors`, `pg`, or any Node.js-only packages in the functions
- Use `process.env` in functions — use `env` from the request context instead
- Create a `wrangler.toml` unless needed — Cloudflare Pages auto-detects functions