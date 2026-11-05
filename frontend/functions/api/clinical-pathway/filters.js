import { json } from '../_supabase.js';
import { golonganClient } from '../_golongan.js';

// GET /api/clinical-pathway/filters
// -> { rumah_sakit: [], diagnosis: [], medical_treatment: [], relations: [{rumah_sakit, diagnosis, medical_treatment}] }
export async function onRequestGet({ env }) {
  try {
    const { data, error } = await golonganClient(env).rpc('cp_filters');
    if (error) return json({ error: error.message }, 500);
    return json(data, 200, { 'cache-control': 'public, max-age=300' });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
