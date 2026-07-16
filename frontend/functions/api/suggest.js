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
