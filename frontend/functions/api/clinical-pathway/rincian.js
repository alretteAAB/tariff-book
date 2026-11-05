import { json } from '../_supabase.js';
import { golonganClient } from '../_golongan.js';

// GET /api/clinical-pathway/rincian?id=<card id> -> [{kegiatan, item, keterangan, qty}]
export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'id tidak valid' }, 400);
  try {
    const { data, error } = await golonganClient(env).rpc('cp_rincian', { f_paket_id: id });
    if (error) return json({ error: error.message }, 500);
    return json(data, 200, { 'cache-control': 'public, max-age=300' });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
