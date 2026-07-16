import { createClient } from '@supabase/supabase-js';

export function getClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

// "?kategori=A,B" or "?kategori=A&kategori=B" -> ['A','B'] | null
export function parseMulti(searchParams, key) {
  const all = searchParams.getAll(key).flatMap(v => v.split(','));
  const arr = all.map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
