import { parseMulti, json } from './_supabase.js';
import { pickShards, callShards } from './_shards.js';
import { mergeSuggest } from './_merge.js';

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const q = (p.get('q') || '').trim();
  if (!q) return json([]);

  const f_rumah_sakit = parseMulti(p, 'rumah_sakit');
  const shards = await pickShards(env, f_rumah_sakit);
  const { ok, failed } = await callShards(shards, 'suggest_tarif', {
    q,
    f_kategori:    parseMulti(p, 'kategori'),
    f_rumah_sakit,
    f_tahun:       parseMulti(p, 'tahun')?.map(Number) ?? null,
    f_kelas:       parseMulti(p, 'kelas_kamar'),
  });
  if (!ok.length) return json({ error: failed[0].error }, 500);

  // One shard is already in final order; several are merged by score.
  if (ok.length === 1) return json(ok[0].data.map(({ score, ...r }) => r));
  return json(mergeSuggest(ok.map(r => r.data)));
}
