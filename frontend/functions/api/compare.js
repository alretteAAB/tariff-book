import { getClient, parseMulti, json } from './_supabase.js';

const COMPARE_ROW_MAX = 500; // batas baris hasil pivot yang dikirim ke UI

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const FIELDS = ['rumah_sakit', 'tahun', 'kelas_kamar'];
  const axis = FIELDS.includes(p.get('axis')) ? p.get('axis') : 'rumah_sakit';

  const q = (p.get('q') || '').trim() || null;
  const f_kategori    = parseMulti(p, 'kategori');
  const f_rumah_sakit = parseMulti(p, 'rumah_sakit');
  const f_tahun       = parseMulti(p, 'tahun')?.map(Number) ?? null;
  const f_kelas       = parseMulti(p, 'kelas_kamar');

  const hasAny = Boolean(q) || f_kategori || f_rumah_sakit || f_tahun || f_kelas;
  if (!hasAny) return json({ axis, columns: [], rows: [], total: 0, truncated: false });

  const supabase = getClient(env);
  const { data, error } = await supabase.rpc('compare_rows_tarif', {
    q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, row_limit: 10000,
  });
  if (error) return json({ error: error.message }, 500);

  // PORT VERBATIM from backend/index.js: the pivot block inside app.get('/compare').
  // i.e. everything from `const nonAxis = ...` through building `columns`, `allRows`,
  // and the final response object (rowsMap / colSet / COMPARE_ROW_MAX = 500 slice).
  // It operates purely on the fetched `data` array, so it ports unchanged.
  const nonAxis = FIELDS.filter(f => f !== axis);

  const rowsMap = new Map();
  const colSet = new Set();
  for (const r of data) {
    const colVal = r[axis];
    colSet.add(colVal);
    const key = JSON.stringify([r.nama_layanan, r.kategori_harga, ...nonAxis.map(f => r[f])]);
    let row = rowsMap.get(key);
    if (!row) {
      row = {
        nama_layanan: r.nama_layanan,
        kategori_harga: r.kategori_harga,
        fixed: Object.fromEntries(nonAxis.map(f => [f, r[f]])),
        cells: {}
      };
      rowsMap.set(key, row);
    }
    // Jika sel terisi ganda (data duplikat), ambil tarif terendah
    row.cells[colVal] = row.cells[colVal] == null ? r.tarif : Math.min(row.cells[colVal], r.tarif);
  }

  const columns = [...colSet].sort((a, b) =>
    axis === 'tahun' ? b - a : String(a).localeCompare(String(b))
  );
  const allRows = [...rowsMap.values()].sort((a, b) =>
    a.nama_layanan.localeCompare(b.nama_layanan) || a.kategori_harga.localeCompare(b.kategori_harga)
  );

  return json({
    axis,
    columns,
    rows: allRows.slice(0, COMPARE_ROW_MAX),
    total: allRows.length,
    truncated: allRows.length > COMPARE_ROW_MAX
  });
}
