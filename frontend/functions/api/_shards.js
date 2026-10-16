// Shard registry + fan-out. Every shard is a Supabase project with the same
// schema and RPCs (sql/shard/*). One hospital lives entirely on one shard.
//
// Env (Cloudflare Pages, Production + Preview):
//   SHARDS=1,2,3   SHARD_1_URL / SHARD_1_KEY, SHARD_2_URL / SHARD_2_KEY, ...
// Without SHARDS, the old SUPABASE_URL / SUPABASE_ANON_KEY pair is shard "1".
import { createClient } from '@supabase/supabase-js';
import { buildHospitalMap } from './_merge.js';

const FILTERS_TTL_MS = 5 * 60 * 1000;

export function getShards(env) {
  const ids = (env.SHARDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) return [{ id: '1', url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY, legacy: true }];
  return ids.map(id => ({ id, url: env[`SHARD_${id}_URL`], key: env[`SHARD_${id}_KEY`] }));
}

const clients = new Map();
function clientFor(shard) {
  if (!shard.url || !shard.key) {
    const names = shard.legacy ? 'SUPABASE_URL / SUPABASE_ANON_KEY' : `SHARD_${shard.id}_URL / SHARD_${shard.id}_KEY`;
    throw new Error(`${names} not set for this Cloudflare environment (Production and Preview are separate)`);
  }
  const cacheKey = `${shard.url}|${shard.key}`;
  if (!clients.has(cacheKey)) {
    clients.set(cacheKey, createClient(shard.url, shard.key, { auth: { persistSession: false } }));
  }
  return clients.get(cacheKey);
}

// Calls one RPC on every given shard in parallel. A shard that errors (paused,
// wrong env, timeout) is reported in `failed` instead of failing the request.
export async function callShards(shards, fn, args) {
  const settled = await Promise.allSettled(shards.map(async shard => {
    const { data, error } = await clientFor(shard).rpc(fn, args);
    if (error) throw new Error(error.message);
    return { shard: shard.id, data };
  }));
  const ok = [];
  const failed = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') ok.push(r.value);
    else failed.push({ shard: shards[i].id, error: r.reason?.message ?? String(r.reason) });
  });
  return { ok, failed };
}

// get_filters() from every shard. Cached per isolate for a few minutes; only
// complete answers are cached so a recovered shard shows up immediately.
let filtersCache = null;
export async function getAllFilters(env, { fresh = false } = {}) {
  const shards = getShards(env);
  const key = shards.map(s => `${s.id}=${s.url}`).join(',');
  if (!fresh && filtersCache?.key === key && Date.now() - filtersCache.at < FILTERS_TTL_MS) {
    return filtersCache.result;
  }
  const result = await callShards(shards, 'get_filters', {});
  if (!result.failed.length) filtersCache = { key, at: Date.now(), result };
  return result;
}

// Shards that can hold rows for the requested hospitals. No hospital filter,
// or a name the map does not know (new upload, shard down), means all shards.
export async function pickShards(env, f_rumah_sakit) {
  const shards = getShards(env);
  if (shards.length === 1 || !f_rumah_sakit) return shards;

  const map = buildHospitalMap((await getAllFilters(env)).ok);
  const ids = new Set();
  for (const name of f_rumah_sakit) {
    if (!map.has(name)) return shards;
    for (const id of map.get(name)) ids.add(id);
  }
  return shards.filter(s => ids.has(s.id));
}

// Marker added to responses when some shards failed.
export const partialInfo = (failed) =>
  failed.length ? { partial: true, failedShards: failed.map(f => f.shard) } : {};
