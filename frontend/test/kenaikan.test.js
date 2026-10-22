import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quantile, summarize, buildKenaikan, buildSelisihKelas } from '../functions/api/_kenaikan.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('quantile interpolates like PERCENTILE.INC', () => {
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([7], 0.25), 7);
  assert.equal(quantile([1, 2, 3], 0.5), 2);        // odd: middle value
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);   // even: mean of the two middle ones
  assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(quantile([1, 2, 3, 4], 0.75), 3.25);
});

test('summarize computes every statistic, including decreases', () => {
  // +10%, +0%, -20%, +50%
  const s = summarize([100, 200, 50, 10], [110, 200, 40, 15]);
  assert.equal(s.n, 4);
  close(s.median, 5);
  close(s.mean, 10);
  close(s.weighted, ((365 - 360) / 360) * 100);
  close(s.q1, -5);
  close(s.q3, 20);
  close(s.min, -20);
  close(s.max, 50);
  assert.deepEqual([s.naik, s.tetap, s.turun], [2, 1, 1]);
  assert.deepEqual(summarize([], []), { n: 0 });
});

const MAP = {
  kategori_besar: ['Laboratorium', 'Radiologi'],
  mapping: { 'TARIF LAB': 'Laboratorium', 'LAB 2': 'Laboratorium', 'RADIOLOGI': 'Radiologi' },
};

test('buildKenaikan groups kategori into kategori besar per hospital and period', () => {
  const rows = [
    { rumah_sakit: 'RS B', tahun_awal: 2025, tahun_akhir: 2026, kategori_harga: 'TARIF LAB', awal: [100, 200], akhir: [110, 220] },
    { rumah_sakit: 'RS B', tahun_awal: 2025, tahun_akhir: 2026, kategori_harga: 'LAB 2', awal: ['50'], akhir: ['50'] },
    { rumah_sakit: 'RS A', tahun_awal: 2025, tahun_akhir: 2026, kategori_harga: 'RADIOLOGI', awal: [100], akhir: [90] },
    { rumah_sakit: 'RS A', tahun_awal: 2024, tahun_akhir: 2025, kategori_harga: 'TARIF LAB', awal: [100], akhir: [120] },
    { rumah_sakit: 'RS A', tahun_awal: 2025, tahun_akhir: 2026, kategori_harga: 'FARMASI', awal: [1, 2, 3], akhir: [1, 2, 3] },
  ];
  const out = buildKenaikan(rows, MAP);
  assert.deepEqual(out.periods, [{ from: 2024, to: 2025 }, { from: 2025, to: 2026 }]);
  assert.deepEqual(out.kategori, ['Laboratorium', 'Radiologi']);
  assert.deepEqual(out.rows.map(r => [r.from, r.kategori_besar, r.rumah_sakit, r.n]), [
    [2024, 'Laboratorium', 'RS A', 1],
    [2025, 'Laboratorium', 'RS B', 3],
    [2025, 'Radiologi', 'RS A', 1],
  ]);
  const lab = out.rows[1];
  close(lab.median, 10);
  close(lab.mean, 20 / 3);
  close(lab.weighted, (380 - 350) / 350 * 100);
  assert.deepEqual([lab.naik, lab.tetap, lab.turun], [2, 1, 0]);
  close(out.rows[2].median, -10);
  assert.deepEqual(out.unmapped, [{ rumah_sakit: 'RS A', from: 2025, to: 2026, n: 3 }]);
});

test('kategori names must match the mapping exactly', () => {
  const row = (kategori_harga) => ({ rumah_sakit: 'RS', tahun_awal: 2025, tahun_akhir: 2026, kategori_harga, awal: [100], akhir: [110] });
  const out = buildKenaikan(['tarif lab', 'TARIF LAB ', ' TARIF LAB', 'TARIF  LAB', 'toString', '__proto__'].map(row), MAP);
  assert.deepEqual(out.rows, []);
  assert.deepEqual(out.unmapped, [{ rumah_sakit: 'RS', from: 2025, to: 2026, n: 6 }]);
});

test('the committed mapping file is well formed', () => {
  const m = JSON.parse(readFileSync(new URL('../functions/api/_kategori_besar.json', import.meta.url)));
  assert.equal(m.kategori_besar.length, 5);
  const used = new Set(Object.values(m.mapping));
  for (const k of used) assert.ok(m.kategori_besar.includes(k), k);
  assert.equal(m.mapping['TARIF TINDAKAN DOKTER SPESIALIS '], 'Jasa Medis (Dokter & Konsultasi)');
});

test('buildSelisihKelas groups by kategori besar and class, orders columns by price', () => {
  const result = {
    kelas_dasar: 'KELAS II',
    kelas: [{ kelas: 'KELAS II', n: 5 }, { kelas: 'VIP', n: 4 }, { kelas: 'Kelas III', n: 3 }, { kelas: 'Isolasi', n: 1 }],
    pairs: [
      { kategori_harga: 'TARIF LAB', kelas: 'VIP', dasar: [100, 200], harga: [150, 300] },
      { kategori_harga: 'LAB 2', kelas: 'VIP', dasar: [100], harga: [100] },
      { kategori_harga: 'RADIOLOGI', kelas: 'Kelas III', dasar: [100], harga: [80] },
      { kategori_harga: 'FARMASI', kelas: 'Isolasi', dasar: [10, 20], harga: [10, 20] },
    ],
  };
  const out = buildSelisihKelas(result, MAP);
  assert.equal(out.kelas_dasar, 'KELAS II');
  assert.deepEqual(out.kolom, ['Kelas III', 'VIP']);           // -20% before +50%
  assert.deepEqual(out.tanpa_pasangan, ['Isolasi']);           // only unmapped pairs
  assert.deepEqual(out.rows.map(r => [r.kategori_besar, r.kelas, r.n]), [
    ['Laboratorium', 'VIP', 3],
    ['Radiologi', 'Kelas III', 1],
  ]);
  close(out.rows[0].median, 50);
  close(out.rows[0].weighted, (550 - 400) / 400 * 100);
  assert.deepEqual([out.rows[0].naik, out.rows[0].tetap, out.rows[0].turun], [2, 1, 0]);
  close(out.rows[1].median, -20);
  assert.deepEqual(out.unmapped, [{ kelas: 'Isolasi', n: 2 }]);
});

test('buildSelisihKelas handles an empty answer', () => {
  const out = buildSelisihKelas(null, MAP);
  assert.deepEqual([out.kelas_dasar, out.kolom, out.rows, out.unmapped, out.tanpa_pasangan], [null, [], [], [], []]);
});
