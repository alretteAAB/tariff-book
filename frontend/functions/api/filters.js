import { json } from './_supabase.js';
import { getAllFilters, partialInfo } from './_shards.js';
import { mergeFilters } from './_merge.js';

export async function onRequestGet({ env }) {
  const { ok, failed } = await getAllFilters(env, { fresh: true });
  if (!ok.length) return json({ error: failed[0].error }, 500);
  if (ok.length === 1 && !failed.length) return json(ok[0].data);
  return json({ ...mergeFilters(ok.map(r => r.data)), ...partialInfo(failed) });
}
