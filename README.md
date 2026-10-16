# tariff-book

A project that is made for stakeholders to check the price for each layanan that hospital give.

- **App + API:** `frontend/` (React SPA and Cloudflare Pages Functions under `frontend/functions/api`), deployed to Cloudflare Pages.
- **Data:** Supabase Postgres, split per hospital across one or more Supabase projects (shards). Schema and RPCs: `sql/shard/`.
- **Maintenance:** `scripts/upload_tarif.py` (upload CSV to the right shard), `scripts/move-hospital.js` (move hospitals between shards), `workers/keepalive` (daily ping so free projects stay active), `sql/shard/runbook-reclaim-space.md`.

How to add a shard, upload data and look after the shards: `docs/shard-guide.md`.
Architecture, environment variables and gotchas: `CLAUDE.md`.

```bash
cd frontend
npm install
npm run dev    # local UI
npm test       # unit tests for the shard merge logic
npm run build
```
