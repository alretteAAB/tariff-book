import { parseMulti, json } from '../_supabase.js';
import { golonganClient } from '../_golongan.js';

// GET /api/clinical-pathway?rumah_sakit=&diagnosis=&medical_treatment=
// -> cards (hospital x diagnosis x medical treatment) with their price per class,
//    without the items (see /api/clinical-pathway/rincian).
export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  try {
    const { data, error } = await golonganClient(env).rpc('cp_search', {
      f_rumah_sakit: parseMulti(p, 'rumah_sakit'),
      f_diagnosis:   parseMulti(p, 'diagnosis'),
      f_treatment:   parseMulti(p, 'medical_treatment'),
    });
    if (error) return json({ error: error.message }, 500);
    return json(data, 200, { 'cache-control': 'public, max-age=300' });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
