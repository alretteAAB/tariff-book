import { createClient } from '@supabase/supabase-js'

const PAGE_SIZE = 50

// Parse a multi-value query param: ?kategori=A&kategori=B or ?kategori=A,B
function parseMulti(url, key) {
  const vals = url.searchParams.getAll(key)
  return vals.flatMap(v => v.split(',').map(s => s.trim()).filter(Boolean))
}

// Escape LIKE wildcards so user-typed % _ \ are matched literally.
function escapeLike(s) {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

// GET /api/search
export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url)

    const q = (url.searchParams.get('q') || '').trim()
    const kategoriFilter = parseMulti(url, 'kategori')
    const rsFilter = parseMulti(url, 'rumah_sakit')
    const tahunFilter = parseMulti(url, 'tahun').map(Number)
    const kelasFilter = parseMulti(url, 'kelas_kamar')

    const hasQ = q !== ''
    const hasFilter = kategoriFilter.length || rsFilter.length || tahunFilter.length || kelasFilter.length
    if (!hasQ && !hasFilter) {
      return Response.json({ data: [], total: 0, page: 1, totalPages: 0 })
    }

    const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1)
    const offset = (page - 1) * PAGE_SIZE
    const ascending = url.searchParams.get('sort') === 'asc'

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    let query = supabase
      .from('tarif')
      .select('kategori_harga, nama_layanan, kelas_kamar, tarif, rumah_sakit, tahun', { count: 'exact' })

    if (hasQ) query = query.ilike('nama_layanan', `%${escapeLike(q)}%`)
    if (kategoriFilter.length) query = query.in('kategori_harga', kategoriFilter)
    if (rsFilter.length) query = query.in('rumah_sakit', rsFilter)
    if (tahunFilter.length) query = query.in('tahun', tahunFilter)
    if (kelasFilter.length) query = query.in('kelas_kamar', kelasFilter)

    query = query
      .order('nama_layanan', { ascending: true })
      .order('tarif', { ascending })
      .range(offset, offset + PAGE_SIZE - 1)

    const { data, count, error } = await query

    if (error) {
      // Page requested beyond the result set → no rows for this page.
      if (error.code === 'PGRST103') {
        return Response.json({ data: [], total: 0, page, totalPages: 0 })
      }
      throw error
    }

    const total = count || 0
    return Response.json({
      data: data || [],
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE)
    })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
