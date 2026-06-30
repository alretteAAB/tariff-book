const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Cek ketersediaan pg_trgm sekali saat start. Kalau ada, pencarian memakai
// pencocokan fuzzy (toleran salah ketik); kalau tidak, fallback ke ILIKE saja.
let trgmEnabled = false;
pool.query("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'")
  .then(r => {
    trgmEnabled = r.rowCount > 0;
    console.log(trgmEnabled
      ? 'pg_trgm aktif: pencarian fuzzy diaktifkan'
      : 'pg_trgm tidak ditemukan: memakai pencarian ILIKE biasa');
  })
  .catch(err => console.error('Gagal cek pg_trgm:', err.message));

// Helper: parse multi-value query param
// ?kategori=A&kategori=B atau ?kategori=A,B
function parseMulti(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return val.split(',').map(v => v.trim()).filter(Boolean);
}

// Whitelist kolom yang boleh dipakai untuk ORDER BY (cegah SQL injection —
// nilai dari client TIDAK PERNAH di-interpolasi langsung ke SQL)
const SORT_COLUMNS = {
  tahun: 't.tahun',
  rumah_sakit: 't.rumah_sakit',
  kategori_harga: 't.kategori_harga',
  nama_layanan: 't.nama_layanan',
  kelas_kamar: 't.kelas_kamar',
  tarif: 't.tarif',
  pct_increase: 'pct_increase',
};

// Bangun klausa ORDER BY dari daftar urutan bertingkat: "col:dir,col:dir,...".
// Hanya kolom dalam whitelist yang dipakai; kolom duplikat diabaikan. Tiebreaker
// default (nama layanan, lalu tarif) selalu ditambahkan di akhir agar urutan stabil.
function buildOrderBy(sortParam) {
  const parts = [];
  const used = new Set();

  for (const token of String(sortParam || '').split(',')) {
    const [rawCol, rawDir] = token.split(':');
    const col = SORT_COLUMNS[(rawCol || '').trim()];
    if (!col || used.has(col)) continue;
    const dir = (rawDir || '').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    parts.push(`${col} ${dir} NULLS LAST`);
    used.add(col);
  }

  // Tiebreaker default: kelompokkan per nama layanan, lalu tarif tertinggi dulu
  for (const [tbCol, tbDir] of [['t.nama_layanan', 'ASC'], ['t.tarif', 'DESC']]) {
    if (!used.has(tbCol)) { parts.push(`${tbCol} ${tbDir}`); used.add(tbCol); }
  }

  return `ORDER BY ${parts.join(', ')}`;
}

// SELECT bersama untuk /search & /export — termasuk kolom pct_increase
// (perubahan harga 2026 vs 2025 untuk item, kategori & kelas kamar yang sama).
const TARIF_SELECT = `
  SELECT t.kategori_harga, t.nama_layanan, t.kelas_kamar, t.tarif,
         t.rumah_sakit, t.tahun,
         CASE
           WHEN t.tahun = 2026 AND p.tarif IS NOT NULL AND p.tarif <> 0
           THEN ROUND(((t.tarif - p.tarif) * 100.0 / p.tarif), 2)
         END AS pct_increase
  FROM tarif t
  LEFT JOIN tarif p
         ON t.nama_layanan = p.nama_layanan
        AND t.kategori_harga = p.kategori_harga
        AND t.kelas_kamar IS NOT DISTINCT FROM p.kelas_kamar
        AND p.tahun = 2025`;

// Bangun WHERE + params + ORDER BY bersama untuk /search, /export, /compare.
// Mengembalikan { where, params, orderBy, hasAny }. Caller menambahkan
// LIMIT/OFFSET memakai index param berikutnya (params.length + 1).
function buildTarifQuery(query) {
  const q = query.q;
  const kategoriFilter = parseMulti(query.kategori);
  const rsFilter = parseMulti(query.rumah_sakit);
  const tahunFilter = parseMulti(query.tahun).map(Number);
  const kelasFilter = parseMulti(query.kelas_kamar);

  const hasQ = Boolean(q && q.trim() !== '');
  const hasFilter = kategoriFilter.length || rsFilter.length || tahunFilter.length || kelasFilter.length;

  const conditions = [];
  const params = [];

  if (hasQ) {
    const raw = q.trim();
    const escaped = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    params.push(`%${escaped}%`);
    if (trgmEnabled) {
      // Cocok sebagai substring (ILIKE) ATAU mirip secara trigram (toleran salah ketik)
      params.push(raw);
      conditions.push(`(t.nama_layanan ILIKE $${params.length - 1} OR $${params.length} <% t.nama_layanan)`);
    } else {
      conditions.push(`t.nama_layanan ILIKE $${params.length}`);
    }
  }
  if (kategoriFilter.length) { params.push(kategoriFilter); conditions.push(`t.kategori_harga = ANY($${params.length})`); }
  if (rsFilter.length)       { params.push(rsFilter);       conditions.push(`t.rumah_sakit = ANY($${params.length})`); }
  if (tahunFilter.length)    { params.push(tahunFilter);    conditions.push(`t.tahun = ANY($${params.length})`); }
  if (kelasFilter.length)    { params.push(kelasFilter);    conditions.push(`t.kelas_kamar = ANY($${params.length})`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = buildOrderBy(query.sort);

  return { where, params, orderBy, hasAny: Boolean(hasQ || hasFilter) };
}

// Cache /filters di memori — data jarang berubah, hindari 6 query DISTINCT tiap load
let filtersCache = null;
let filtersCacheAt = 0;
const FILTERS_TTL = 5 * 60 * 1000; // 5 menit

// GET /filters — semua distinct values untuk dropdown + relasi kategori↔rumah_sakit + relasi kelas_kamar↔rumah_sakit
app.get('/filters', async (req, res) => {
  if (filtersCache && Date.now() - filtersCacheAt < FILTERS_TTL) {
    return res.json(filtersCache);
  }
  try {
    const [kategori, rumahSakit, tahun, kelasKamar, relations, kelasRelations] = await Promise.all([
      pool.query('SELECT DISTINCT kategori_harga FROM tarif ORDER BY kategori_harga ASC'),
      pool.query('SELECT DISTINCT rumah_sakit FROM tarif ORDER BY rumah_sakit ASC'),
      pool.query('SELECT DISTINCT tahun FROM tarif ORDER BY tahun DESC'),
      pool.query('SELECT DISTINCT kelas_kamar FROM tarif WHERE kelas_kamar IS NOT NULL ORDER BY kelas_kamar ASC'),
      pool.query('SELECT DISTINCT kategori_harga, rumah_sakit FROM tarif ORDER BY kategori_harga, rumah_sakit'),
      pool.query('SELECT DISTINCT kelas_kamar, rumah_sakit FROM tarif WHERE kelas_kamar IS NOT NULL ORDER BY kelas_kamar, rumah_sakit')
    ]);

    filtersCache = {
      kategori: kategori.rows.map(r => r.kategori_harga),
      rumah_sakit: rumahSakit.rows.map(r => r.rumah_sakit),
      tahun: tahun.rows.map(r => r.tahun),
      kelas_kamar: kelasKamar.rows.map(r => r.kelas_kamar),
      relations: relations.rows,           // [{ kategori_harga, rumah_sakit }]
      kelas_relations: kelasRelations.rows  // [{ kelas_kamar, rumah_sakit }]
    };
    filtersCacheAt = Date.now();
    res.json(filtersCache);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /search
app.get('/search', async (req, res) => {
  const { where, params, orderBy, hasAny } = buildTarifQuery(req.query);

  // Kalau ga ada query dan ga ada filter apapun, return kosong
  if (!hasAny) return res.json({ data: [], total: 0, page: 1, totalPages: 0 });

  const PAGE_SIZE = 50;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const limIdx = params.length + 1;

    // Jalanin query data + count paralel
    const [result, countResult] = await Promise.all([
      pool.query(
        `${TARIF_SELECT} ${where} ${orderBy} LIMIT $${limIdx} OFFSET $${limIdx + 1}`,
        [...params, PAGE_SIZE, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM tarif t ${where}`, params)
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({
      data: result.rows,
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /export — unduh seluruh hasil terfilter (tanpa pagination) sebagai CSV / XLSX
const EXPORT_MAX = 50000;
const EXPORT_HEADERS = ['Tahun', 'Rumah Sakit', 'Kategori', 'Nama Layanan', 'Kelas Kamar', 'Tarif', '% vs Tahun Lalu'];

function exportRow(r) {
  return [
    r.tahun,
    r.rumah_sakit,
    (r.kategori_harga || '').replace('TARIF ', ''),
    r.nama_layanan,
    r.kelas_kamar,
    r.tarif,
    r.pct_increase != null ? r.pct_increase : ''
  ];
}

// Bungkus sel CSV; pakai delimiter ';' agar cocok dengan Excel locale id-ID
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function escapeXml(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Bangun file Excel SpreadsheetML 2003 (XML) tanpa dependensi.
// Dibuka langsung oleh Excel/LibreOffice/Google Sheets, mendukung header tebal
// serta format angka (#,##0) dan persen (0.00%).
function buildSpreadsheetML(rows) {
  const numCell = (v, styleId) =>
    v == null || v === '' ? '<Cell/>'
      : `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ''}><Data ss:Type="Number">${v}</Data></Cell>`;
  const strCell = (v) => `<Cell><Data ss:Type="String">${escapeXml(v)}</Data></Cell>`;

  const headerRow = `<Row>${EXPORT_HEADERS
    .map(h => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
    .join('')}</Row>`;

  const bodyRows = rows.map(r => {
    const pct = r.pct_increase != null ? r.pct_increase / 100 : null;
    return '<Row>' + [
      numCell(r.tahun),
      strCell(r.rumah_sakit),
      strCell((r.kategori_harga || '').replace('TARIF ', '')),
      strCell(r.nama_layanan),
      strCell(r.kelas_kamar),
      numCell(r.tarif, 'rp'),
      numCell(pct, 'pct'),
    ].join('') + '</Row>';
  }).join('');

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<?mso-application progid="Excel.Sheet"?>\n'
    + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
    + '<Styles>'
    + '<Style ss:ID="hdr"><Font ss:Bold="1"/></Style>'
    + '<Style ss:ID="rp"><NumberFormat ss:Format="#,##0"/></Style>'
    + '<Style ss:ID="pct"><NumberFormat ss:Format="0.00%"/></Style>'
    + '</Styles>\n'
    + '<Worksheet ss:Name="Buku Tarif"><Table>\n'
    + headerRow + '\n' + bodyRows + '\n'
    + '</Table></Worksheet>\n</Workbook>';
}

app.get('/export', async (req, res) => {
  const { where, params, orderBy, hasAny } = buildTarifQuery(req.query);
  if (!hasAny) return res.status(400).json({ error: 'Tidak ada filter atau kata kunci untuk diekspor' });

  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    const { rows } = await pool.query(
      `${TARIF_SELECT} ${where} ${orderBy} LIMIT $${params.length + 1}`,
      [...params, EXPORT_MAX]
    );

    if (format === 'xlsx') {
      const xml = buildSpreadsheetML(rows);
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="buku-tarif-${stamp}.xls"`);
      return res.send(xml);
    }

    // CSV (default)
    const lines = [EXPORT_HEADERS.map(csvCell).join(';')];
    for (const r of rows) lines.push(exportRow(r).map(csvCell).join(';'));
    const csv = '﻿' + lines.join('\r\n'); // BOM agar Excel id-ID baca UTF-8 benar

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="buku-tarif-${stamp}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /compare — matriks perbandingan tarif dengan sumbu kolom yang bisa diganti
// axis = rumah_sakit | tahun | kelas_kamar. Baris = layanan + dimensi non-sumbu.
const COMPARE_SOURCE_MAX = 10000; // batas baris sumber yang diambil
const COMPARE_ROW_MAX = 500;      // batas baris hasil pivot yang dikirim ke UI

app.get('/compare', async (req, res) => {
  const FIELDS = ['rumah_sakit', 'tahun', 'kelas_kamar'];
  const axis = FIELDS.includes(req.query.axis) ? req.query.axis : 'rumah_sakit';
  const nonAxis = FIELDS.filter(f => f !== axis);

  const { where, params, hasAny } = buildTarifQuery(req.query);
  if (!hasAny) return res.json({ axis, columns: [], rows: [], total: 0, truncated: false });

  try {
    const { rows: data } = await pool.query(
      `SELECT nama_layanan, kategori_harga, rumah_sakit, tahun, kelas_kamar, tarif
       FROM tarif t ${where} LIMIT $${params.length + 1}`,
      [...params, COMPARE_SOURCE_MAX]
    );

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

    res.json({
      axis,
      columns,
      rows: allRows.slice(0, COMPARE_ROW_MAX),
      total: allRows.length,
      truncated: allRows.length > COMPARE_ROW_MAX
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /suggest
app.get('/suggest', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim() === '') return res.json([]);

  const kategoriFilter = parseMulti(req.query.kategori);
  const rsFilter = parseMulti(req.query.rumah_sakit);
  const tahunFilter = parseMulti(req.query.tahun).map(Number);
  const kelasFilter = parseMulti(req.query.kelas_kamar);

  try {
    const raw = q.trim();
    const escapedQ = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const params = [`%${escapedQ}%`];

    // Cocok substring; bila pg_trgm aktif, ikut sertakan kecocokan fuzzy ($2)
    let nameCond = `nama_layanan ILIKE $1`;
    if (trgmEnabled) {
      params.push(raw);
      nameCond = `(nama_layanan ILIKE $1 OR $2 <% nama_layanan)`;
    }
    const conditions = [nameCond];

    if (kategoriFilter.length) { params.push(kategoriFilter); conditions.push(`kategori_harga = ANY($${params.length})`); }
    if (rsFilter.length)       { params.push(rsFilter);       conditions.push(`rumah_sakit = ANY($${params.length})`); }
    if (tahunFilter.length)    { params.push(tahunFilter);    conditions.push(`tahun = ANY($${params.length})`); }
    if (kelasFilter.length)    { params.push(kelasFilter);    conditions.push(`kelas_kamar = ANY($${params.length})`); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    // Saat fuzzy, urutkan saran berdasarkan kemiripan terdekat dulu
    const outerOrder = trgmEnabled
      ? `ORDER BY word_similarity($2, nama_layanan) DESC, nama_layanan ASC`
      : `ORDER BY nama_layanan ASC`;

    const sql = `
      SELECT nama_layanan, kategori_harga FROM (
        SELECT DISTINCT ON (nama_layanan) nama_layanan, kategori_harga
        FROM tarif
        ${where}
        ORDER BY nama_layanan
      ) s
      ${outerOrder}
      LIMIT 6
    `;

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
