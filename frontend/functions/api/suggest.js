import { createClient } from '@supabase/supabase-js'

// Parse a multi-value query param: ?kategori=A&kategori=B or ?kategori=A,B
function parseMulti(url, key) {
  const vals = url.searchParams.getAll(key)
  return vals.flatMap(v => v.split(',').map(s => s.trim()).filter(Boolean))
}

// Escape LIKE wildcards so user-typed % _ \ are matched literally.
function escapeLike(s) {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

// GET /api/suggest — autocomplete: up to 6 distinct nama_layanan.
export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') || '').trim()
    if (q === '') return Response.json([])

    const kategoriFilter = parseMulti(url, 'kategori')
    const rsFilter = parseMulti(url, 'rumah_sakit')
    const tahunFilter = parseMulti(url, 'tahun').map(Number)
    const kelasFilter = parseMulti(url, 'kelas_kamar')

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    let query = supabase
      .from('tarif')
      .select('nama_layanan, kategori_harga')
      .ilike('nama_layanan', `%${escapeLike(q)}%`)

    if (kategoriFilter.length) query = query.in('kategori_harga', kategoriFilter)
    if (rsFilter.length) query = query.in('rumah_sakit', rsFilter)
    if (tahunFilter.length) query = query.in('tahun', tahunFilter)
    if (kelasFilter.length) query = query.in('kelas_kamar', kelasFilter)

    // The JS client has no DISTINCT ON. The same nama_layanan repeats across
    // hospitals/years/classes, so over-fetch then dedupe down to 6 distinct
    // names (a flat .limit(6) would often yield far fewer after dedupe).
    const { data, error } = await query.limit(50)
    if (error) throw error

    const seen = new Set()
    const suggestions = []
    for (const row of data) {
      if (seen.has(row.nama_layanan)) continue
      seen.add(row.nama_layanan)
      suggestions.push({ nama_layanan: row.nama_layanan, kategori_harga: row.kategori_harga })
      if (suggestions.length === 6) break
    }

    return Response.json(suggestions)
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
