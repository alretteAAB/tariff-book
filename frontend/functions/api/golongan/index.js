import { parseMulti, json } from '../_supabase.js';
import { golonganClient } from '../_golongan.js';

const PAGE_SIZE = 50;

// GET /api/golongan?q=&rumah_sakit=&specialty=&golongan=&sort=col:asc,...&page=
export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const page = Math.max(1, parseInt(p.get('page')) || 1);
  try {
    const { data, error } = await golonganClient(env).rpc('search_golongan', {
      q: (p.get('q') || '').trim() || null,
      f_rumah_sakit: parseMulti(p, 'rumah_sakit'),
      f_specialty:   parseMulti(p, 'specialty'),
      f_golongan:    parseMulti(p, 'golongan'),
      sort: p.get('sort') || null,
      page,
      page_size: PAGE_SIZE,
    });
    if (error) return json({ error: error.message }, 500);
    const total = data.length ? Number(data[0].total_count) : 0;
    return json({
      data: data.map(({ total_count, ...r }) => r),
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
