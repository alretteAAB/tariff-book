# Buku Tarif — Hospital Tariff Book

A search app that lets stakeholders look up the price (tarif) of each hospital
service (layanan) and medical procedure. Search by name, filter by year,
hospital, price category, and room class, with paginated, sortable results.

## Architecture

Everything runs on **Cloudflare Pages** — there is no separate backend server.
This keeps the app reachable even on corporate networks that block third-party
hosts, since the browser only ever talks to the Pages domain.

```
Browser ──► Cloudflare Pages (static React app)
              └─ /api/* ──► Pages Functions ──► Supabase (PostgreSQL)
```

- **Frontend** — React + Vite, served as static assets.
- **API** — Cloudflare Pages Functions in [`frontend/functions/api/`](frontend/functions/api/),
  using the `@supabase/supabase-js` client.
- **Database** — Supabase (PostgreSQL), table `tarif`.

## Project structure

```
tariff-book/
└── frontend/
    ├── functions/api/      # Cloudflare Pages Functions → served at /api/*
    │   ├── filters.js      # GET /api/filters
    │   ├── search.js       # GET /api/search
    │   └── suggest.js      # GET /api/suggest
    ├── src/                # React app (App.jsx)
    ├── .env.example        # required env vars (documentation)
    └── .dev.vars.example   # copy → .dev.vars for local wrangler dev
```

## API endpoints

All endpoints query the `tarif` table
(`kategori_harga, nama_layanan, kelas_kamar, tarif, rumah_sakit, tahun`).
Multi-value filters accept either `?kategori=A,B` or `?kategori=A&kategori=B`.

| Endpoint | Purpose | Key params |
|----------|---------|------------|
| `GET /api/filters` | Distinct values for the dropdowns + the kategori↔rumah_sakit and kelas_kamar↔rumah_sakit relations used for cascading filters | — |
| `GET /api/search` | Paginated search (50 rows/page) | `q`, `kategori`, `rumah_sakit`, `tahun`, `kelas_kamar`, `page`, `sort` (`asc`/`desc`) |
| `GET /api/suggest` | Autocomplete — up to 6 distinct `nama_layanan` | `q` (required) + the same optional filters |

## Environment variables

The Pages Functions read these **server-side** (they are intentionally *not*
`VITE_`-prefixed, so the keys never reach the browser bundle):

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |

Set them in **Cloudflare Pages → Settings → Environment Variables** for
production, and in a local `.dev.vars` file for development.

## Local development

```bash
cd frontend
npm install                              # installs deps (also syncs package-lock.json)
cp .dev.vars.example .dev.vars           # then fill in your Supabase keys
npm run build                            # build the static app into dist/
npx wrangler pages dev ./dist --port 8788   # serve the Functions locally

# in a second terminal, for hot-reloading frontend dev:
npm run dev                              # Vite proxies /api/* → localhost:8788
```

## Deploy

Deploy `frontend/` to Cloudflare Pages:

- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Output directory:** `dist`
- Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the Pages environment variables.

Cloudflare auto-detects `frontend/functions/` and routes `/api/*` to them — no
`wrangler.toml` needed.

## Note on access control

The Functions use the Supabase **anon key**, so Row Level Security (RLS)
applies. If the `tarif` table has RLS enabled, add a policy allowing `anon` to
`SELECT` it — otherwise queries return empty results.
