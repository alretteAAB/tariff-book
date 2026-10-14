import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSort, makeComparator, mergeSorted, mergeSuggest, mergeFilters, buildHospitalMap,
} from '../functions/api/_merge.js';

test('parseSort mirrors build_order_by', () => {
  assert.deepEqual(parseSort(null), [
    { col: 'nama_layanan', desc: false, nullsFirst: false },
    { col: 'tarif', desc: true, nullsFirst: true },
  ]);
  assert.deepEqual(parseSort('tarif:asc,tahun,bogus:asc,tarif:desc'), [
    { col: 'tarif', desc: false, nullsFirst: false },
    { col: 'tahun', desc: true, nullsFirst: false },
    { col: 'nama_layanan', desc: false, nullsFirst: false },
  ]);
  // SQL compares lower(split_part(tok, ':', 2)) = 'asc' without trimming
  assert.equal(parseSort('tarif: asc')[0].desc, true);
  assert.equal(parseSort(' tarif:ASC ')[0].desc, true);
  assert.equal(parseSort(' tarif:ASC')[0].desc, false);
});

test('comparator puts nulls last for chosen keys in both directions', () => {
  const rows = [{ pct_increase: null }, { pct_increase: 5 }, { pct_increase: -2 }];
  const asc = [...rows].sort(makeComparator('pct_increase:asc')).map(r => r.pct_increase);
  const desc = [...rows].sort(makeComparator('pct_increase:desc')).map(r => r.pct_increase);
  assert.deepEqual(asc, [-2, 5, null]);
  assert.deepEqual(desc, [5, -2, null]);
});

test('comparator applies tiebreakers nama_layanan asc, then tarif desc', () => {
  const rows = [
    { tahun: 2026, nama_layanan: 'B', tarif: 1 },
    { tahun: 2026, nama_layanan: 'A', tarif: 1 },
    { tahun: 2026, nama_layanan: 'A', tarif: 9 },
    { tahun: 2025, nama_layanan: 'Z', tarif: 5 },
  ];
  const out = [...rows].sort(makeComparator('tahun:desc'));
  assert.deepEqual(out.map(r => `${r.tahun}${r.nama_layanan}${r.tarif}`),
    ['2026A9', '2026A1', '2026B1', '2025Z5']);
});

test('comparator compares numeric columns as numbers even when sent as strings', () => {
  const rows = [{ tarif: '900' }, { tarif: '10000' }];
  assert.deepEqual([...rows].sort(makeComparator('tarif:asc')).map(r => r.tarif), ['900', '10000']);
});

test('mergeSorted equals sorting everything in one place, then paging', () => {
  const all = [];
  for (let i = 0; i < 300; i++) {
    all.push({ nama_layanan: `L${i % 17}`, tarif: (i * 7919) % 1000, tahun: 2025 + (i % 2), rumah_sakit: `RS ${i % 5}` });
  }
  const sort = 'rumah_sakit:asc,tarif:desc';
  const cmp = makeComparator(sort);
  const shardA = all.filter(r => r.rumah_sakit < 'RS 2').sort(cmp);
  const shardB = all.filter(r => r.rumah_sakit >= 'RS 2').sort(cmp);
  const expected = [...all].sort(cmp);
  assert.deepEqual(mergeSorted([shardA, shardB], sort), expected);
  assert.deepEqual(mergeSorted([shardA, shardB], sort, 50, 50), expected.slice(50, 100));
});

test('mergeSuggest dedupes by name, keeps best score, limits to 6, drops score', () => {
  const a = [
    { nama_layanan: 'USG ABDOMEN', kategori_harga: 'K1', score: 1 },
    { nama_layanan: 'USG DOPPLER', kategori_harga: 'K1', score: 0.8 },
  ];
  const b = [
    { nama_layanan: 'USG DOPPLER', kategori_harga: 'K2', score: 0.9 },
    { nama_layanan: 'MUSCULO USG', kategori_harga: 'K2', score: null },
    ...['A', 'B', 'C', 'D'].map(x => ({ nama_layanan: `USG ${x}`, kategori_harga: 'K3', score: 0.5 })),
  ];
  assert.deepEqual(mergeSuggest([a, b]), [
    { nama_layanan: 'USG ABDOMEN', kategori_harga: 'K1' },
    { nama_layanan: 'USG DOPPLER', kategori_harga: 'K2' },
    { nama_layanan: 'USG A', kategori_harga: 'K3' },
    { nama_layanan: 'USG B', kategori_harga: 'K3' },
    { nama_layanan: 'USG C', kategori_harga: 'K3' },
    { nama_layanan: 'USG D', kategori_harga: 'K3' },
  ]);
  assert.equal(mergeSuggest([[{ nama_layanan: 'X', score: null }], [{ nama_layanan: 'Y', score: 0.1 }]])[0].nama_layanan, 'Y');
});

test('mergeFilters unions and sorts like get_filters', () => {
  const s1 = {
    kategori: ['TARIF LAB'], rumah_sakit: ['RS B'], tahun: [2025], kelas_kamar: ['VIP'],
    relations: [{ kategori_harga: 'TARIF LAB', rumah_sakit: 'RS B' }],
    kelas_relations: [{ kelas_kamar: 'VIP', rumah_sakit: 'RS B' }],
  };
  const s2 = {
    kategori: ['TARIF LAB', 'TARIF IGD'], rumah_sakit: ['RS A'], tahun: [2026, 2025], kelas_kamar: ['Kelas 1', 'VIP'],
    relations: [{ kategori_harga: 'TARIF LAB', rumah_sakit: 'RS A' }, { kategori_harga: 'TARIF LAB', rumah_sakit: 'RS B' }],
    kelas_relations: [{ kelas_kamar: 'Kelas 1', rumah_sakit: 'RS A' }],
  };
  assert.deepEqual(mergeFilters([s1, s2]), {
    kategori: ['TARIF IGD', 'TARIF LAB'],
    rumah_sakit: ['RS A', 'RS B'],
    tahun: [2026, 2025],
    kelas_kamar: ['Kelas 1', 'VIP'],
    relations: [
      { kategori_harga: 'TARIF LAB', rumah_sakit: 'RS A' },
      { kategori_harga: 'TARIF LAB', rumah_sakit: 'RS B' },
    ],
    kelas_relations: [
      { kelas_kamar: 'Kelas 1', rumah_sakit: 'RS A' },
      { kelas_kamar: 'VIP', rumah_sakit: 'RS B' },
    ],
  });
});

test('buildHospitalMap maps each hospital to the shards that hold its rows', () => {
  const map = buildHospitalMap([
    { shard: '1', data: { relations: [{ kategori_harga: 'K', rumah_sakit: 'RS A' }, { kategori_harga: 'L', rumah_sakit: 'RS A' }] } },
    { shard: '2', data: { relations: [{ kategori_harga: 'K', rumah_sakit: 'RS B' }] } },
  ]);
  assert.deepEqual([...map.get('RS A')], ['1']);
  assert.deepEqual([...map.get('RS B')], ['2']);
  assert.equal(map.has('RS C'), false);
});
