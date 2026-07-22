# CLAUDE.md — Migrate tariff-book backend to Cloudflare Pages Functions + Supabase

> Handoff spec for Claude Code. Read this whole file, then execute the steps in order.
> Everything needed to build and deploy is here. Reference `backend/index.js` for the
> two blocks explicitly marked "port verbatim".

---

## 1. Context

**tariff-book** is a hospital tariff search app. Stakeholders search ~532k rows of
tariff data (`tarif` table) by service name + filters, and export/compare results.

**Current stack (what's in the repo now):**
- `frontend/` — Vite + React SPA (deployed on Cloudflare Pages)
- `backend/` — Express API using **node-postgres** (`pg` pool), connecting directly to
  the Supabase Postgres. Routes: `/filters`, `/search`, `/suggest`, `/export`, `/compare`.
  Hosted as a **separate server** (was Railway — subscription expired).
- Database: **Supabase Postgres** (project `wxixsguicwznoxgllfbo`).

**Problem being solved:** the separate Express server is a liability. The work network
blocks third-party hosts (Railway got blocked). Cloudflare is resilient there because
blocking it breaks general internet access. So we move the API onto **Cloudflare Pages
Functions** (same platform as the frontend) and talk to Supabase over its HTTPS API
(`@supabase/supabase-js`), which works on the Workers runtime where `pg` does not.

**Target stack (goal):**
- `frontend/` — same SPA, now also hosts the API under `frontend/functions/api/*`
- Heavy SQL (fuzzy search, `pct_increase` self-join, `DISTINCT ON`, dynamic sort) lives in
  **Postgres functions (RPC)**. The Functions are thin wrappers that call `.rpc()`.
- `backend/` — **deleted** after migration is verified.

**Why RPC and not plain `.from().select()`:** the current search has trigram fuzzy
matching (typo tolerance) via `pg_trgm` (`<%` operator + `word_similarity` ordering),
a self-join for `pct_increase`, and `DISTINCT ON` for suggestions. PostgREST/`.select()`
cannot express these. Pushing them into RPC preserves behaviour exactly.

---

## 2. Target repo structure

```
frontend/
  functions/
    api/
      _supabase.js      # shared Supabase client + helpers (underscore = not routed)
      filters.js        # GET /api/filters
      search.js         # GET /api/search
      suggest.js        # GET /api/suggest
      export.js         # GET /api/export
      compare.js        # GET /api/compare
  src/ ...              # existing React app (API base changes to /api)
  package.json          # add @supabase/supabase-js
backend/                # DELETE after verification
```

Cloudflare Pages maps `frontend/functions/api/search.js` → route `/api/search`.
The `/api/` prefix avoids clashing with the SPA's client-side routes.

---

## 3. Step 1 — Database migration (run FIRST, in Supabase SQL Editor)

Run this whole block **before** deploying the Functions, otherwise the `.rpc()` calls
will 404. Role: `postgres`. It is idempotent (safe to re-run).

> IMPORTANT — column types: the RETURNS TABLE signatures below assume
> `tahun int`, `tarif numeric`, and the rest `text`. Verify against the real schema:
> `select column_name, data_type from information_schema.columns where table_name='tarif';`
> The SELECTs cast explicitly (`::int`, `::numeric`, `::text`) so results match the
> declared return types; if a base column is a different type the cast handles it, but
> adjust the declared types if a cast is invalid.

```sql
-- ============================================================
-- tariff-book: search performance + Cloudflare/Supabase migration
-- ============================================================

-- --- Extensions -------------------------------------------------
create extension if not exists pg_trgm;

-- --- Indexes (fix statement timeout on ~532k rows) --------------
-- Fuzzy + substring search on nama_layanan (ILIKE + <% operator)
create index if not exists idx_nama_layanan_trgm
  on tarif using gin (nama_layanan gin_trgm_ops);

-- Self-join for pct_increase: partial index on the "previous year" side
create index if not exists idx_tarif_prev
  on tarif (nama_layanan, kategori_harga, kelas_kamar)
  where tahun = 2025;

-- Filter-only queries (dropdowns without a keyword) + COUNT
create index if not exists idx_tarif_tahun    on tarif (tahun);
create index if not exists idx_tarif_kategori on tarif (kategori_harga);
create index if not exists idx_tarif_rs       on tarif (rumah_sakit);
create index if not exists idx_tarif_kelas    on tarif (kelas_kamar);

-- --- Row Level Security -----------------------------------------
-- The Functions use the ANON key, which RESPECTS RLS. Without this policy,
-- every query silently returns 0 rows. (Direct pg connection bypassed RLS,
-- which is why this never bit us before.)
alter table tarif enable row level security;

drop policy if exists "public read tarif" on tarif;
create policy "public read tarif" on tarif
  for select to anon using (true);

-- --- Helper: escape ILIKE wildcards -----------------------------
create or replace function esc_like(s text)
returns text language sql immutable as $$
  select replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- --- Helper: whitelist-safe ORDER BY builder --------------------
create or replace function build_order_by(sort text)
returns text language plpgsql immutable as $$
declare
  allowed jsonb := '{
    "tahun":"t.tahun","rumah_sakit":"t.rumah_sakit","kategori_harga":"t.kategori_harga",
    "nama_layanan":"t.nama_layanan","kelas_kamar":"t.kelas_kamar","tarif":"t.tarif",
    "pct_increase":"pct_increase"}';
  parts text[] := '{}';
  used  text[] := '{}';
  tok text; col_sql text; dir text;
begin
  foreach tok in array string_to_array(coalesce(sort, ''), ',') loop
    col_sql := allowed ->> trim(split_part(tok, ':', 1));
    if col_sql is null or col_sql = any(used) then continue; end if;
    dir := case when lower(split_part(tok, ':', 2)) = 'asc' then 'asc' else 'desc' end;
    parts := parts || (col_sql || ' ' || dir || ' nulls last');
    used  := used  || col_sql;
  end loop;
  -- stable tiebreakers
  if not ('t.nama_layanan' = any(used)) then parts := parts || 't.nama_layanan asc'::text;  end if;
  if not ('t.tarif'        = any(used)) then parts := parts || 't.tarif desc'::text;         end if;
  return array_to_string(parts, ', ');
end $$;

-- --- RPC: search (data + total for pagination) ------------------
create or replace function search_tarif(
  q text default null,
  f_kategori text[] default null,
  f_rumah_sakit text[] default null,
  f_tahun int[] default null,
  f_kelas text[] default null,
  sort text default null,
  page int default 1,
  page_size int default 50
)
returns table (
  kategori_harga text, nama_layanan text, kelas_kamar text, tarif numeric,
  rumah_sakit text, tahun int, pct_increase numeric, total_count bigint
)
language plpgsql stable as $$
declare
  v_offset int  := (greatest(page, 1) - 1) * page_size;
  v_order  text := build_order_by(sort);
begin
  return query execute
    $q$
    select t.kategori_harga::text, t.nama_layanan::text, t.kelas_kamar::text,
           t.tarif::numeric, t.rumah_sakit::text, t.tahun::int,
           case when t.tahun = 2026 and p.tarif is not null and p.tarif <> 0
                then round((t.tarif - p.tarif) * 100.0 / p.tarif, 2)
           end as pct_increase,
           count(*) over() as total_count
    from tarif t
    left join tarif p
      on t.nama_layanan   = p.nama_layanan
     and t.kategori_harga = p.kategori_harga
     and t.kelas_kamar is not distinct from p.kelas_kamar
     and p.tahun = 2025
    where ($1 is null or (t.nama_layanan ilike '%' || esc_like($1) || '%'
                          or $1 <% t.nama_layanan
                          or t.kategori_harga ilike '%' || esc_like($1) || '%'))
      and ($2 is null or t.kategori_harga = any($2))
      and ($3 is null or t.rumah_sakit    = any($3))
      and ($4 is null or t.tahun          = any($4))
      and ($5 is null or t.kelas_kamar    = any($5))
    order by
    $q$ || v_order || $q$
    limit $6 offset $7
    $q$
  using q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, page_size, v_offset;
end $$;

-- --- RPC: suggest (autocomplete, max 6) -------------------------
create or replace function suggest_tarif(
  q text,
  f_kategori text[] default null,
  f_rumah_sakit text[] default null,
  f_tahun int[] default null,
  f_kelas text[] default null
)
returns table (nama_layanan text, kategori_harga text)
language sql stable as $$
  select nama_layanan::text, kategori_harga::text
  from (
    select distinct on (nama_layanan) nama_layanan, kategori_harga
    from tarif
    where (q is null or (nama_layanan ilike '%' || esc_like(q) || '%' or q <% nama_layanan))
      and (f_kategori    is null or kategori_harga = any(f_kategori))
      and (f_rumah_sakit is null or rumah_sakit    = any(f_rumah_sakit))
      and (f_tahun       is null or tahun          = any(f_tahun))
      and (f_kelas       is null or kelas_kamar    = any(f_kelas))
    order by nama_layanan
  ) s
  order by word_similarity(q, nama_layanan) desc nulls last, nama_layanan asc
  limit 6;
$$;

-- --- RPC: raw rows for /compare (pivot happens in JS) -----------
create or replace function compare_rows_tarif(
  q text default null,
  f_kategori text[] default null,
  f_rumah_sakit text[] default null,
  f_tahun int[] default null,
  f_kelas text[] default null,
  row_limit int default 10000
)
returns table (
  nama_layanan text, kategori_harga text, rumah_sakit text,
  tahun int, kelas_kamar text, tarif numeric
)
language sql stable as $$
  select nama_layanan::text, kategori_harga::text, rumah_sakit::text,
         tahun::int, kelas_kamar::text, tarif::numeric
  from tarif
  where (q is null or (nama_layanan ilike '%' || esc_like(q) || '%' or q <% nama_layanan))
    and (f_kategori    is null or kategori_harga = any(f_kategori))
    and (f_rumah_sakit is null or rumah_sakit    = any(f_rumah_sakit))
    and (f_tahun       is null or tahun          = any(f_tahun))
    and (f_kelas       is null or kelas_kamar    = any(f_kelas))
  limit row_limit;
$$;

-- --- RPC: filters (all dropdown values + relations, as JSON) ----
create or replace function get_filters()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'kategori',    (select coalesce(jsonb_agg(k order by k),'[]') from (select distinct kategori_harga k from tarif) x),
    'rumah_sakit', (select coalesce(jsonb_agg(r order by r),'[]') from (select distinct rumah_sakit r from tarif) x),
    'tahun',       (select coalesce(jsonb_agg(th order by th desc),'[]') from (select distinct tahun th from tarif) x),
    'kelas_kamar', (select coalesce(jsonb_agg(kk order by kk),'[]') from (select distinct kelas_kamar kk from tarif where kelas_kamar is not null) x),
    'relations',   (select coalesce(jsonb_agg(jsonb_build_object('kategori_harga',kategori_harga,'rumah_sakit',rumah_sakit) order by kategori_harga,rumah_sakit),'[]')
                    from (select distinct kategori_harga, rumah_sakit from tarif) x),
    'kelas_relations', (select coalesce(jsonb_agg(jsonb_build_object('kelas_kamar',kelas_kamar,'rumah_sakit',rumah_sakit) order by kelas_kamar,rumah_sakit),'[]')
                    from (select distinct kelas_kamar, rumah_sakit from tarif where kelas_kamar is not null) x)
  );
$$;

-- --- Grants (anon must be able to EXECUTE the RPCs) -------------
grant execute on function search_tarif        to anon;
grant execute on function suggest_tarif       to anon;
grant execute on function compare_rows_tarif  to anon;
grant execute on function get_filters         to anon;

-- --- Refresh planner stats --------------------------------------
analyze tarif;
```

**Quick DB sanity check (run after the block above):**
```sql
select * from search_tarif('usg', null, null, array[2026], null, null, 1, 5);
select get_filters();
```

---

## 4. Step 2 — Add the Supabase dependency

In `frontend/package.json`, add to `dependencies`:
```json
"@supabase/supabase-js": "^2.45.0"
```
(Use the latest 2.x. Cloudflare Pages runs `npm install` at build, so it gets bundled.)

---

## 5. Step 3 — Create the Functions

### `frontend/functions/api/_supabase.js`
```js
import { createClient } from '@supabase/supabase-js';

export function getClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

// "?kategori=A,B" or "?kategori=A&kategori=B" -> ['A','B'] | null
export function parseMulti(searchParams, key) {
  const all = searchParams.getAll(key).flatMap(v => v.split(','));
  const arr = all.map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
```

### `frontend/functions/api/filters.js`
```js
import { getClient, json } from './_supabase.js';

export async function onRequestGet({ env }) {
  const supabase = getClient(env);
  const { data, error } = await supabase.rpc('get_filters');
  if (error) return json({ error: error.message }, 500);
  return json(data);
}
```

### `frontend/functions/api/search.js`
```js
import { getClient, parseMulti, json } from './_supabase.js';

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const q = (p.get('q') || '').trim() || null;
  const f_kategori    = parseMulti(p, 'kategori');
  const f_rumah_sakit = parseMulti(p, 'rumah_sakit');
  const f_tahun       = parseMulti(p, 'tahun')?.map(Number) ?? null;
  const f_kelas       = parseMulti(p, 'kelas_kamar');
  const sort = p.get('sort') || null;
  const page = Math.max(1, parseInt(p.get('page')) || 1);
  const page_size = 50;

  const hasAny = Boolean(q) || f_kategori || f_rumah_sakit || f_tahun || f_kelas;
  if (!hasAny) return json({ data: [], total: 0, page: 1, totalPages: 0 });

  const supabase = getClient(env);
  const { data, error } = await supabase.rpc('search_tarif', {
    q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, sort, page, page_size,
  });
  if (error) return json({ error: error.message }, 500);

  const total = data.length ? Number(data[0].total_count) : 0;
  const rows  = data.map(({ total_count, ...r }) => r);
  return json({ data: rows, total, page, totalPages: Math.ceil(total / page_size) });
}
```

### `frontend/functions/api/suggest.js`
```js
import { getClient, parseMulti, json } from './_supabase.js';

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const q = (p.get('q') || '').trim();
  if (!q) return json([]);

  const supabase = getClient(env);
  const { data, error } = await supabase.rpc('suggest_tarif', {
    q,
    f_kategori:    parseMulti(p, 'kategori'),
    f_rumah_sakit: parseMulti(p, 'rumah_sakit'),
    f_tahun:       parseMulti(p, 'tahun')?.map(Number) ?? null,
    f_kelas:       parseMulti(p, 'kelas_kamar'),
  });
  if (error) return json({ error: error.message }, 500);
  return json(data);
}
```

### `frontend/functions/api/export.js`
```js
import { getClient, parseMulti, json } from './_supabase.js';

// PORT VERBATIM from backend/index.js (unchanged — pure formatting):
//   EXPORT_HEADERS, exportRow(), csvCell(), escapeXml(), buildSpreadsheetML()
// Paste those five here.

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const q = (p.get('q') || '').trim() || null;
  const f_kategori    = parseMulti(p, 'kategori');
  const f_rumah_sakit = parseMulti(p, 'rumah_sakit');
  const f_tahun       = parseMulti(p, 'tahun')?.map(Number) ?? null;
  const f_kelas       = parseMulti(p, 'kelas_kamar');
  const sort = p.get('sort') || null;

  const hasAny = Boolean(q) || f_kategori || f_rumah_sakit || f_tahun || f_kelas;
  if (!hasAny) return json({ error: 'Tidak ada filter atau kata kunci untuk diekspor' }, 400);

  const supabase = getClient(env);
  // Reuse search_tarif with a large page_size to get every filtered row (with pct + sort)
  const { data: rows, error } = await supabase.rpc('search_tarif', {
    q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, sort, page: 1, page_size: 50000,
  });
  if (error) return json({ error: error.message }, 500);

  const stamp = new Date().toISOString().slice(0, 10);

  if (p.get('format') === 'xlsx') {
    return new Response(buildSpreadsheetML(rows), {
      headers: {
        'content-type': 'application/vnd.ms-excel; charset=utf-8',
        'content-disposition': `attachment; filename="buku-tarif-${stamp}.xls"`,
      },
    });
  }

  const lines = [EXPORT_HEADERS.map(csvCell).join(';')];
  for (const r of rows) lines.push(exportRow(r).map(csvCell).join(';'));
  const csv = '\uFEFF' + lines.join('\r\n'); // BOM for Excel id-ID UTF-8

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="buku-tarif-${stamp}.csv"`,
    },
  });
}
```
> Note: rows from `search_tarif` already have the fields `exportRow`/`buildSpreadsheetML`
> expect (`tahun, rumah_sakit, kategori_harga, nama_layanan, kelas_kamar, tarif, pct_increase`),
> so the ported functions work unchanged.

### `frontend/functions/api/compare.js`
```js
import { getClient, parseMulti, json } from './_supabase.js';

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const FIELDS = ['rumah_sakit', 'tahun', 'kelas_kamar'];
  const axis = FIELDS.includes(p.get('axis')) ? p.get('axis') : 'rumah_sakit';

  const q = (p.get('q') || '').trim() || null;
  const f_kategori    = parseMulti(p, 'kategori');
  const f_rumah_sakit = parseMulti(p, 'rumah_sakit');
  const f_tahun       = parseMulti(p, 'tahun')?.map(Number) ?? null;
  const f_kelas       = parseMulti(p, 'kelas_kamar');

  const hasAny = Boolean(q) || f_kategori || f_rumah_sakit || f_tahun || f_kelas;
  if (!hasAny) return json({ axis, columns: [], rows: [], total: 0, truncated: false });

  const supabase = getClient(env);
  const { data, error } = await supabase.rpc('compare_rows_tarif', {
    q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, row_limit: 10000,
  });
  if (error) return json({ error: error.message }, 500);

  // PORT VERBATIM from backend/index.js: the pivot block inside app.get('/compare').
  // i.e. everything from `const nonAxis = ...` through building `columns`, `allRows`,
  // and the final response object (rowsMap / colSet / COMPARE_ROW_MAX = 500 slice).
  // It operates purely on the fetched `data` array, so it ports unchanged.
}
```

---

## 6. Step 4 — Point the frontend at `/api`

The SPA currently calls the external Express base URL (look for `VITE_API_URL`,
`import.meta.env.VITE_API_URL`, or a hardcoded backend URL in `frontend/src`).

- Change the API base to **`/api`** (same origin now).
- Endpoints become: `/api/search`, `/api/filters`, `/api/suggest`, `/api/export`, `/api/compare`.
- Remove the old external backend URL and any related CORS assumptions (same-origin → no CORS).
- If a `VITE_API_URL` env var is still referenced, set it to `/api` (or delete the var and
  hardcode `/api`). Update `.env` / `.env.example` accordingly.

---

## 7. Step 5 — Cloudflare Pages config

In the Cloudflare Pages project (already connected to this repo):

- **Root directory:** `frontend`
- **Build command:** `npm install && npm run build`  *(not `npm ci` — package-lock can be out of sync)*
- **Build output directory:** `dist`
- **Functions:** auto-detected from `frontend/functions/` (no extra config)

**Environment variables** — set for BOTH **Production** and **Preview**:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://wxixsguicwznoxgllfbo.supabase.co` |
| `SUPABASE_ANON_KEY` | *(anon public key — legacy format — from Supabase → Project Settings → API)* |

> Never commit the key. Set it only in the Cloudflare dashboard. Use the **legacy anon
> public** key format (the long JWT-style `eyJ...` key), not the new publishable key.

---

## 8. Step 6 — Deploy & clean up

1. Run the **Step 1 SQL** in Supabase (must be done before the Functions go live).
2. Commit the new `frontend/functions/` + `package.json` + frontend API-base change.
3. Push to `main` → Cloudflare Pages auto-builds and deploys.
4. Verify (Section 9).
5. Once verified: **delete the `backend/` folder** and decommission its old host (Railway/etc).

---

## 9. Verification checklist

Against the deployed Pages URL:

- [ ] `GET /api/filters` → JSON with `kategori`, `rumah_sakit`, `tahun`, `kelas_kamar`,
      `relations`, `kelas_relations` (non-empty). *Empty ⇒ RLS policy missing (Step 1).*
- [ ] `GET /api/search?q=usg` → `{ data: [...], total, page, totalPages }` with rows.
- [ ] `GET /api/search?tahun=2026` (filter only, no `q`) → returns rows (no timeout).
- [ ] Typo test: `GET /api/search?q=uzg` still returns USG-ish rows (fuzzy works).
- [ ] `GET /api/suggest?q=us` → up to 6 `{ nama_layanan, kategori_harga }`.
- [ ] `GET /api/export?q=usg&format=xlsx` → downloads an `.xls` that opens in Excel.
- [ ] `GET /api/export?q=usg` → downloads `.csv` (semicolon-delimited, opens clean in Excel id-ID).
- [ ] `GET /api/compare?q=usg&axis=rumah_sakit` → `{ axis, columns, rows, total, truncated }`.
- [ ] Frontend loads, search/filter/suggest/export/compare all work end-to-end.
- [ ] `pct_increase` column shows values on 2026 rows (self-join working).

---

## 10. Gotchas / notes

- **RLS is the #1 silent failure.** ANON key respects RLS; the old direct `pg` connection
  bypassed it. If queries return empty but error-free, the `public read tarif` policy
  (Step 1) is missing or didn't apply.
- **RPC arg names must match** the function params exactly (`q`, `f_kategori`,
  `f_rumah_sakit`, `f_tahun`, `f_kelas`, `sort`, `page`, `page_size`). The JS keys above do.
- **`pg` will not run on Cloudflare Workers runtime** — do not try to reuse `backend/db.js`.
  All DB access goes through `@supabase/supabase-js` (HTTP), which is why logic moved to RPC.
- **Underscore files aren't routed:** `_supabase.js` is a shared module, not an endpoint.
- **Column types:** if `select get_filters();` or `search_tarif(...)` errors on a cast,
  reconcile the RETURNS TABLE declared types with the real `tarif` schema.
- **Statement timeout:** the indexes in Step 1 are what actually fixed the original
  `canceling statement due to statement timeout`. Keep them.
