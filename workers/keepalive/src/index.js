// Daily ping: calls shard_stats() on every shard (same SHARDS / SHARD_n_URL /
// SHARD_n_KEY scheme as the Pages Functions). A real query counts as activity
// for Supabase's inactivity pause. Any failing shard fails the run, so it
// shows up as an error in the Worker's logs.

async function ping(env, id) {
  const url = env[`SHARD_${id}_URL`];
  const key = env[`SHARD_${id}_KEY`];
  if (!url || !key) throw new Error(`shard ${id}: SHARD_${id}_URL / SHARD_${id}_KEY not set`);
  const res = await fetch(`${url}/rest/v1/rpc/shard_stats`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`shard ${id}: HTTP ${res.status} ${await res.text()}`);
  const stats = await res.json();
  return `shard ${id}: ${stats.db_size}, ${stats.hospitals.length} hospitals`;
}

async function pingAll(env) {
  const ids = (env.SHARDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const results = await Promise.allSettled(ids.map(id => ping(env, id)));
  const lines = results.map(r => (r.status === 'fulfilled' ? r.value : `FAILED ${r.reason.message}`));
  console.log(lines.join('\n'));
  if (results.some(r => r.status === 'rejected')) throw new Error(lines.join('; '));
  return lines;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pingAll(env));
  },
};
