// Daily ping: calls shard_stats() on every shard (same SHARDS / SHARD_n_URL /
// SHARD_n_KEY scheme as the Pages Functions) and, when GOLONGAN_URL is set,
// on the golongan operasi project. A real query counts as activity for
// Supabase's inactivity pause. Any failing project fails the run, so it shows
// up as an error in the Worker's logs.

async function ping(label, url, key, names) {
  if (!url || !key) throw new Error(`${label}: ${names} not set`);
  const res = await fetch(`${url}/rest/v1/rpc/shard_stats`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${await res.text()}`);
  const stats = await res.json();
  return `${label}: ${stats.db_size}, ${stats.hospitals.length} hospitals`;
}

async function pingAll(env) {
  const ids = (env.SHARDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const targets = ids.map(id => ping(`shard ${id}`, env[`SHARD_${id}_URL`], env[`SHARD_${id}_KEY`], `SHARD_${id}_URL / SHARD_${id}_KEY`));
  if (env.GOLONGAN_URL) targets.push(ping('golongan', env.GOLONGAN_URL, env.GOLONGAN_KEY, 'GOLONGAN_URL / GOLONGAN_KEY'));
  const results = await Promise.allSettled(targets);
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
