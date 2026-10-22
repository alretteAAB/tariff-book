// Pure helpers for /api/kenaikan (no I/O, tested in test/kenaikan.test.js).
// kenaikan_tarif() (sql/shard/02_rpc.sql) already paired 100% identical items
// and returns their prices; here they are grouped into the kategori besar
// from the Excel mapping and summarized.

// Quantile with linear interpolation between closest ranks (the same as
// Excel PERCENTILE.INC and numpy's default). `sorted` is ascending.
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Statistics for one group of pairs. `awal` / `akhir` are equal-length price
// arrays; every pair has awal > 0 (the SQL drops the others).
export function summarize(awal, akhir) {
  const pct = awal.map((a, i) => ((akhir[i] - a) / a) * 100);
  const sorted = [...pct].sort((x, y) => x - y);
  const n = pct.length;
  if (!n) return { n: 0 };
  const sumAwal = awal.reduce((s, v) => s + v, 0);
  const sumAkhir = akhir.reduce((s, v) => s + v, 0);
  return {
    n,
    median: quantile(sorted, 0.5),
    mean: pct.reduce((s, v) => s + v, 0) / n,
    weighted: ((sumAkhir - sumAwal) / sumAwal) * 100,
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    min: sorted[0],
    max: sorted[n - 1],
    naik: awal.filter((a, i) => akhir[i] > a).length,
    tetap: awal.filter((a, i) => akhir[i] === a).length,
    turun: awal.filter((a, i) => akhir[i] < a).length,
  };
}

// kenaikan_tarif() rows from every shard -> dashboard payload.
// mapping: { kategori_besar: [...], mapping: { kategori_harga: kategori besar } }
// Category names are matched exactly (no trim, no case folding).
export function buildKenaikan(rows, { kategori_besar, mapping }) {
  const groups = new Map();   // rs|awal|akhir|besar -> { awal: [], akhir: [] }
  const unmapped = new Map(); // rs|awal|akhir -> item count
  const periods = new Map();
  for (const r of rows) {
    const from = Number(r.tahun_awal);
    const to = Number(r.tahun_akhir);
    periods.set(`${from}-${to}`, { from, to });
    const awal = r.awal.map(Number);
    const akhir = r.akhir.map(Number);
    const besar = Object.hasOwn(mapping, r.kategori_harga) ? mapping[r.kategori_harga] : null;
    if (!besar) {
      const key = JSON.stringify([r.rumah_sakit, from, to]);
      unmapped.set(key, (unmapped.get(key) ?? 0) + awal.length);
      continue;
    }
    const key = JSON.stringify([r.rumah_sakit, from, to, besar]);
    if (!groups.has(key)) groups.set(key, { awal: [], akhir: [] });
    const g = groups.get(key);
    g.awal.push(...awal);
    g.akhir.push(...akhir);
  }

  const order = (k) => kategori_besar.indexOf(k);
  const out = [...groups].map(([key, g]) => {
    const [rumah_sakit, from, to, besar] = JSON.parse(key);
    return { rumah_sakit, from, to, kategori_besar: besar, ...summarize(g.awal, g.akhir) };
  }).sort((a, b) => a.from - b.from || order(a.kategori_besar) - order(b.kategori_besar)
    || a.rumah_sakit.localeCompare(b.rumah_sakit));

  return {
    periods: [...periods.values()].sort((a, b) => a.from - b.from),
    kategori: kategori_besar,
    rows: out,
    unmapped: [...unmapped].map(([key, n]) => {
      const [rumah_sakit, from, to] = JSON.parse(key);
      return { rumah_sakit, from, to, n };
    }).sort((a, b) => a.from - b.from || a.rumah_sakit.localeCompare(b.rumah_sakit)),
  };
}

// selisih_kelas_tarif() result -> class comparison payload for one hospital
// and year. Rows are (kategori besar x class), each compared with the base
// class. Columns are ordered from cheapest to most expensive relative to the
// base class (median over all mapped pairs), then by name.
export function buildSelisihKelas(result, { kategori_besar, mapping }) {
  const groups = new Map();    // besar|kelas -> { dasar: [], harga: [] }
  const perKelas = new Map();  // kelas -> pct of every mapped pair (column order)
  const unmapped = new Map();  // kelas -> item count
  for (const p of result?.pairs ?? []) {
    const dasar = p.dasar.map(Number);
    const harga = p.harga.map(Number);
    const besar = Object.hasOwn(mapping, p.kategori_harga) ? mapping[p.kategori_harga] : null;
    if (!besar) {
      unmapped.set(p.kelas, (unmapped.get(p.kelas) ?? 0) + dasar.length);
      continue;
    }
    const key = JSON.stringify([besar, p.kelas]);
    if (!groups.has(key)) groups.set(key, { dasar: [], harga: [] });
    const g = groups.get(key);
    g.dasar.push(...dasar);
    g.harga.push(...harga);
    if (!perKelas.has(p.kelas)) perKelas.set(p.kelas, []);
    perKelas.get(p.kelas).push(...dasar.map((d, i) => ((harga[i] - d) / d) * 100));
  }

  const overall = new Map([...perKelas].map(([k, pct]) => [k, quantile(pct.sort((a, b) => a - b), 0.5)]));
  const kolom = [...overall.keys()].sort((a, b) => overall.get(a) - overall.get(b) || a.localeCompare(b));
  const order = (k) => kategori_besar.indexOf(k);
  const rows = [...groups].map(([key, g]) => {
    const [besar, kelas] = JSON.parse(key);
    return { kategori_besar: besar, kelas, ...summarize(g.dasar, g.harga) };
  }).sort((a, b) => order(a.kategori_besar) - order(b.kategori_besar) || kolom.indexOf(a.kelas) - kolom.indexOf(b.kelas));

  const dasar = result?.kelas_dasar ?? null;
  return {
    kelas_dasar: dasar,
    kelas: result?.kelas ?? [],
    kolom,
    // classes of this hospital that share no mapped item with the base class
    tanpa_pasangan: (result?.kelas ?? []).map(k => k.kelas).filter(k => k !== dasar && !overall.has(k)),
    kategori: kategori_besar,
    rows,
    unmapped: [...unmapped].map(([kelas, n]) => ({ kelas, n })).sort((a, b) => a.kelas.localeCompare(b.kelas)),
  };
}
