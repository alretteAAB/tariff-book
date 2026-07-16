import { getClient, parseMulti, json } from './_supabase.js';

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const q = (p.get('q') || '').trim() || null;
  const f_kategori    = parseMulti(p, 'kategori');
  const f_rumah_sakit = parseMulti(p, 'rumah_sakit');
  const f_tahun       = parseMulti(p, 'tahun')?.map(Number) ?? null;
  const f_kelas       = parseMulti(p, 'kelas_kamar');
  const sort = p.get('sort') || null;
  const page = Math.max(1, parseInt(p.get('page')) || 1);
  const page_size = 50;

  const hasAny = Boolean(q) || f_kategori || f_rumah_sakit || f_tahun || f_kelas;
  if (!hasAny) return json({ data: [], total: 0, page: 1, totalPages: 0 });

  const supabase = getClient(env);
  const { data, error } = await supabase.rpc('search_tarif', {
    q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, sort, page, page_size,
  });
  if (error) return json({ error: error.message }, 500);

  const total = data.length ? Number(data[0].total_count) : 0;
  const rows  = data.map(({ total_count, ...r }) => r);
  return json({ data: rows, total, page, totalPages: Math.ceil(total / page_size) });
}
