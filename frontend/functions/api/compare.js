import { parseMulti, json } from './_supabase.js';
import { pickShards, callShards, partialInfo } from './_shards.js';

const COMPARE_ROW_MAX = 500; // batas baris hasil pivot yang dikirim ke UI
const SOURCE_ROW_LIMIT = 10000; // batas baris mentah, total untuk semua shard

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

  const shards = await pickShards(env, f_rumah_sakit);
  const { ok, failed } = await callShards(shards, 'compare_rows_tarif', {
    q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, row_limit: SOURCE_ROW_LIMIT,
  });
  if (!ok.length) return json({ error: failed[0].error }, 500);
  const data = ok.flatMap(r => r.data).slice(0, SOURCE_ROW_LIMIT);

  // Pivot, ported unchanged from the old Express backend. It only reads the
  // fetched `data` array, so rows combined from several shards work as-is.
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
    truncated: allRows.length > COMPARE_ROW_MAX,
    ...partialInfo(failed)
  });
}
