import { json } from './_supabase.js';
import { getAllFilters, partialInfo } from './_shards.js';
import { mergeFilters } from './_merge.js';

// Filters only change after an upload; let browsers reuse them for a few
// minutes (complete answers only, so a shard outage is not remembered).
const CACHE = { 'cache-control': 'public, max-age=300' };

export async function onRequestGet({ env }) {
  const { ok, failed } = await getAllFilters(env, { fresh: true });
  if (!ok.length) return json({ error: failed[0].error }, 500);
  if (ok.length === 1 && !failed.length) return json(ok[0].data, 200, CACHE);
  if (failed.length) return json({ ...mergeFilters(ok.map(r => r.data)), ...partialInfo(failed) });
  return json(mergeFilters(ok.map(r => r.data)), 200, CACHE);
}
