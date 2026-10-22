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
