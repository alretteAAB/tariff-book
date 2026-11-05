// Shared request/response helpers. Supabase clients live in _shards.js.

// "?tahun=2025,2026" or "?tahun=2025&tahun=2026" -> ['2025','2026'] | null.
// Only for values that never contain a comma (years); names use parseList.
export function parseMulti(searchParams, key) {
  const all = searchParams.getAll(key).flatMap(v => v.split(','));
  const arr = all.map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

// "?diagnosis=A&diagnosis=B" -> ['A','B'] | null. Values are taken whole, so
// names that contain a comma ("Pneumonia, unspecified") stay one value. Use
// this where the page sends one parameter per choice.
export function parseList(searchParams, key) {
  const arr = searchParams.getAll(key).map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
