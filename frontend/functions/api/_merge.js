// Pure helpers for combining RPC results from several Supabase shards.
// No I/O here, so test/merge.test.js can exercise them with `node --test`.

// Text order. Postgres sorts with the database collation, JS with ICU; for
// ordinary Latin names they agree, but punctuation/case edge cases can differ,
// so a multi-shard result may be ordered slightly differently than one DB.
const collator = new Intl.Collator('en');
export const compareText = (a, b) => collator.compare(String(a), String(b));

const NUMERIC = new Set(['tahun', 'tarif', 'pct_increase']);
const SORTABLE = new Set([
  'tahun', 'rumah_sakit', 'nama_group', 'kategori_harga',
  'nama_layanan', 'kelas_kamar', 'tarif', 'pct_increase',
]);

// Mirrors build_order_by() in sql/shard/02_rpc.sql: whitelisted columns,
// "asc" only when spelled exactly (any other suffix means desc), first
// occurrence wins, NULLS LAST; then the tiebreakers nama_layanan ASC and
// tarif DESC (plain SQL defaults: ASC → nulls last, DESC → nulls first).
export function parseSort(sort) {
  const keys = [];
  const used = new Set();
  for (const tok of String(sort ?? '').split(',')) {
    const col = tok.split(':')[0].trim();
    if (!SORTABLE.has(col) || used.has(col)) continue;
    const desc = (tok.split(':')[1] ?? '').toLowerCase() !== 'asc';
    keys.push({ col, desc, nullsFirst: false });
    used.add(col);
  }
  if (!used.has('nama_layanan')) keys.push({ col: 'nama_layanan', desc: false, nullsFirst: false });
  if (!used.has('tarif')) keys.push({ col: 'tarif', desc: true, nullsFirst: true });
  return keys;
}

export function makeComparator(sort) {
  const keys = parseSort(sort);
  return (a, b) => {
    for (const { col, desc, nullsFirst } of keys) {
      const x = a[col];
      const y = b[col];
      if (x == null || y == null) {
        if (x == null && y == null) continue;
        return (x == null) === nullsFirst ? -1 : 1;
      }
      const c = NUMERIC.has(col) ? Number(x) - Number(y) : compareText(x, y);
      if (c) return desc ? -c : c;
    }
    return 0;
  };
}

// Each list is already sorted by `sort` on its own shard. Returns the rows
// [offset, offset + limit) of the combined order.
export function mergeSorted(lists, sort, offset = 0, limit = Infinity) {
  return lists.flat().sort(makeComparator(sort)).slice(offset, offset + limit);
}

// Same order as suggest_tarif: score desc (nulls last), nama_layanan asc.
// A service offered on several shards is listed once, keeping its best score.
export function mergeSuggest(lists, limit = 6) {
  const all = lists.flat().sort((a, b) => {
    if (a.score == null || b.score == null) {
      if (a.score == null && b.score == null) return compareText(a.nama_layanan, b.nama_layanan);
      return a.score == null ? 1 : -1;
    }
    return b.score - a.score || compareText(a.nama_layanan, b.nama_layanan);
  });
  const seen = new Set();
  const out = [];
  for (const { score, ...row } of all) {
    if (seen.has(row.nama_layanan)) continue;
    seen.add(row.nama_layanan);
    out.push(row);
    if (out.length === limit) break;
  }
  return out;
}

const uniqueSorted = (values, cmp) => [...new Set(values)].sort(cmp);

function uniqueObjects(lists, a, b) {
  const byKey = new Map();
  for (const o of lists.flat()) byKey.set(JSON.stringify([o[a], o[b]]), o);
  return [...byKey.values()].sort((x, y) => compareText(x[a], y[a]) || compareText(x[b], y[b]));
}

// Union of get_filters() results, sorted the way get_filters sorts them.
export function mergeFilters(list) {
  const pick = (k) => list.map(f => f?.[k] ?? []);
  return {
    kategori:        uniqueSorted(pick('kategori').flat(), compareText),
    rumah_sakit:     uniqueSorted(pick('rumah_sakit').flat(), compareText),
    tahun:           uniqueSorted(pick('tahun').flat(), (a, b) => b - a),
    kelas_kamar:     uniqueSorted(pick('kelas_kamar').flat(), compareText),
    relations:       uniqueObjects(pick('relations'), 'kategori_harga', 'rumah_sakit'),
    kelas_relations: uniqueObjects(pick('kelas_relations'), 'kelas_kamar', 'rumah_sakit'),
    rs_tahun:        uniqueObjects(pick('rs_tahun'), 'rumah_sakit', 'tahun'),
  };
}

// display_name -> Set of shard ids holding rows for that hospital, built from
// get_filters().relations (only hospitals that actually have tarif rows).
export function buildHospitalMap(perShard) {
  const map = new Map();
  for (const { shard, data } of perShard) {
    for (const { rumah_sakit } of data?.relations ?? []) {
      if (!map.has(rumah_sakit)) map.set(rumah_sakit, new Set());
      map.get(rumah_sakit).add(shard);
    }
  }
  return map;
}
