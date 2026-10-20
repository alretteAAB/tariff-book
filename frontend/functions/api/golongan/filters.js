import { json } from '../_supabase.js';
import { golonganClient } from '../_golongan.js';

// GET /api/golongan/filters -> { rumah_sakit: [], specialty: [], golongan: [] }
export async function onRequestGet({ env }) {
  try {
    const { data, error } = await golonganClient(env).rpc('get_golongan_filters');
    if (error) return json({ error: error.message }, 500);
    return json(data);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
