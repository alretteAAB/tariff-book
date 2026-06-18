const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Helper: parse multi-value query param
// ?kategori=A&kategori=B atau ?kategori=A,B
function parseMulti(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return val.split(',').map(v => v.trim()).filter(Boolean);
}

// GET /filters — semua distinct values untuk dropdown + relasi kategori↔rumah_sakit + relasi kelas_kamar↔rumah_sakit
app.get('/filters', async (req, res) => {
  try {
    const [kategori, rumahSakit, tahun, kelasKamar, relations, kelasRelations] = await Promise.all([
      pool.query('SELECT DISTINCT kategori_harga FROM tarif ORDER BY kategori_harga ASC'),
      pool.query('SELECT DISTINCT rumah_sakit FROM tarif ORDER BY rumah_sakit ASC'),
      pool.query('SELECT DISTINCT tahun FROM tarif ORDER BY tahun DESC'),
      pool.query('SELECT DISTINCT kelas_kamar FROM tarif WHERE kelas_kamar IS NOT NULL ORDER BY kelas_kamar ASC'),
      pool.query('SELECT DISTINCT kategori_harga, rumah_sakit FROM tarif ORDER BY kategori_harga, rumah_sakit'),
      pool.query('SELECT DISTINCT kelas_kamar, rumah_sakit FROM tarif WHERE kelas_kamar IS NOT NULL ORDER BY kelas_kamar, rumah_sakit')
    ]);

    res.json({
      kategori: kategori.rows.map(r => r.kategori_harga),
      rumah_sakit: rumahSakit.rows.map(r => r.rumah_sakit),
      tahun: tahun.rows.map(r => r.tahun),
      kelas_kamar: kelasKamar.rows.map(r => r.kelas_kamar),
      relations: relations.rows,           // [{ kategori_harga, rumah_sakit }]
      kelas_relations: kelasRelations.rows  // [{ kelas_kamar, rumah_sakit }]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /search
app.get('/search', async (req, res) => {
  const { q } = req.query;

  const kategoriFilter = parseMulti(req.query.kategori);
  const rsFilter = parseMulti(req.query.rumah_sakit);
  const tahunFilter = parseMulti(req.query.tahun).map(Number);
  const kelasFilter = parseMulti(req.query.kelas_kamar);

  // Kalau ga ada query dan ga ada filter apapun, return kosong
  const hasQ = q && q.trim() !== '';
  const hasFilter = kategoriFilter.length || rsFilter.length || tahunFilter.length || kelasFilter.length;
  if (!hasQ && !hasFilter) return res.json({ data: [], total: 0, page: 1, totalPages: 0 });

  const PAGE_SIZE = 50;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const conditions = [];
    const params = [];
    let i = 1;

    if (hasQ) {
      const escaped = q.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      params.push(`%${escaped}%`);
      conditions.push(`t.nama_layanan ILIKE $${i++}`);
    }
    if (kategoriFilter.length) {
      params.push(kategoriFilter);
      conditions.push(`t.kategori_harga = ANY($${i++})`);
    }
    if (rsFilter.length) {
      params.push(rsFilter);
      conditions.push(`t.rumah_sakit = ANY($${i++})`);
    }
    if (tahunFilter.length) {
      params.push(tahunFilter);
      conditions.push(`t.tahun = ANY($${i++})`);
    }
    if (kelasFilter.length) {
      params.push(kelasFilter);
      conditions.push(`t.kelas_kamar = ANY($${i++})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortDir = req.query.sort === 'asc' ? 'ASC' : 'DESC';

    // Jalanin query data + count paralel
    const [result, countResult] = await Promise.all([
      pool.query(
        `SELECT t.kategori_harga, t.nama_layanan, t.kelas_kamar, t.tarif,
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
               AND p.tahun = 2025
         ${where}
         ORDER BY t.nama_layanan ASC, t.tarif ${sortDir}
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, PAGE_SIZE, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM tarif t ${where}`,
        params
      )
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

// GET /suggest
app.get('/suggest', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim() === '') return res.json([]);

  const kategoriFilter = parseMulti(req.query.kategori);
  const rsFilter = parseMulti(req.query.rumah_sakit);
  const tahunFilter = parseMulti(req.query.tahun).map(Number);
  const kelasFilter = parseMulti(req.query.kelas_kamar);

  try {
    let i = 2;
    const escapedQ = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const params = [`%${escapedQ}%`];
    let where = `WHERE nama_layanan ILIKE $1`;

    if (kategoriFilter.length) {
      params.push(kategoriFilter);
      where += ` AND kategori_harga = ANY($${i++})`;
    }
    if (rsFilter.length) {
      params.push(rsFilter);
      where += ` AND rumah_sakit = ANY($${i++})`;
    }
    if (tahunFilter.length) {
      params.push(tahunFilter);
      where += ` AND tahun = ANY($${i++})`;
    }
    if (kelasFilter.length) {
      params.push(kelasFilter);
      where += ` AND kelas_kamar = ANY($${i++})`;
    }

    const sql = `
      SELECT DISTINCT ON (nama_layanan) nama_layanan, kategori_harga
      FROM tarif
      ${where}
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
