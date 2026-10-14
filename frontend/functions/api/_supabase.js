// Shared request/response helpers. Supabase clients live in _shards.js.

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
