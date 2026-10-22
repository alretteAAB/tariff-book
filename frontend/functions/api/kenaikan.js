import { parseMulti, json } from './_supabase.js';
import { pickShards, callShards, partialInfo } from './_shards.js';
import { buildKenaikan } from './_kenaikan.js';
import kategoriBesar from './_kategori_besar.json';

// GET /api/kenaikan?rumah_sakit=A&rumah_sakit=B&tahun=2025,2026
// Price increase per kategori besar, each selected year vs the next one.
export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const f_rumah_sakit = parseMulti(p, 'rumah_sakit');
  const f_tahun = parseMulti(p, 'tahun')?.map(Number).filter(Number.isInteger) ?? [];
  if (!f_rumah_sakit || f_tahun.length < 2) {
    return json({ periods: [], kategori: kategoriBesar.kategori_besar, rows: [], unmapped: [] });
  }

  const shards = await pickShards(env, f_rumah_sakit);
  const { ok, failed } = await callShards(shards, 'kenaikan_tarif', { f_rumah_sakit, f_tahun });
  if (!ok.length) return json({ error: failed[0].error }, 500);

  const body = buildKenaikan(ok.flatMap(r => r.data ?? []), kategoriBesar);
  if (failed.length) return json({ ...body, ...partialInfo(failed) });
  return json(body, 200, { 'cache-control': 'public, max-age=300' });
}
