# Buku Tarif — Frontend + API

The deployable unit of the app: a React + Vite single-page app plus the
Cloudflare Pages Functions that back it. See the [root README](../README.md)
for the full architecture overview.

## Layout

- `src/` — the React app ([App.jsx](src/App.jsx) holds the UI and all `/api` calls).
- `functions/api/` — Cloudflare Pages Functions, served at `/api/*`:
  - `filters.js`, `search.js`, `suggest.js`.

The React app talks only to relative `/api/*` URLs; the Functions talk to
Supabase using `@supabase/supabase-js`.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server with HMR (proxies `/api/*` → `localhost:8788`) |
| `npm run build` | Builds the static app into `dist/` |
| `npm run preview` | Serves the built `dist/` |
| `npm run lint` | Runs ESLint |

> `npm run build` only builds the frontend. The Functions in `functions/` are
> bundled separately by Cloudflare on deploy (or run locally via wrangler).

## Running the API locally

The Functions need `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Locally these come
from a `.dev.vars` file (gitignored):

```bash
cp .dev.vars.example .dev.vars   # then fill in your Supabase keys
npm run build
npx wrangler pages dev ./dist --port 8788
```

Run `npm run dev` in another terminal for a hot-reloading frontend that proxies
API calls to the wrangler server on port 8788.
