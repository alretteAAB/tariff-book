import { parseMulti, json } from './_supabase.js';
import { pickShards, callShards, partialInfo } from './_shards.js';
import { buildSelisihKelas } from './_kenaikan.js';
import kategoriBesar from './_kategori_besar.json';

// GET /api/selisih-kelas?rumah_sakit=A&tahun=2026[&kelas=KELAS II]
// Price difference of every room class vs the base class, per kategori besar,
// inside one hospital and one year (see selisih_kelas_tarif in 02_rpc.sql).
export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const f_rumah_sakit = (p.get('rumah_sakit') || '').trim() || null;
  const f_tahun = Number(p.get('tahun'));
  const f_kelas = (p.get('kelas') || '').trim() || null;
  if (!f_rumah_sakit || !Number.isInteger(f_tahun)) {
    return json(buildSelisihKelas(null, kategoriBesar));
  }

  const shards = await pickShards(env, parseMulti(p, 'rumah_sakit'));
  const { ok, failed } = await callShards(shards, 'selisih_kelas_tarif', { f_rumah_sakit, f_tahun, f_kelas });
  if (!ok.length) return json({ error: failed[0].error }, 500);

  // A hospital lives on one shard; the others answer with no classes.
  const hit = ok.map(r => r.data).find(d => d?.kelas?.length) ?? null;
  const body = buildSelisihKelas(hit, kategoriBesar);
  if (failed.length) return json({ ...body, ...partialInfo(failed) });
  return json(body, 200, { 'cache-control': 'public, max-age=300' });
}
