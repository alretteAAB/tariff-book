import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { API, readStoredFilters, storeFilters } from "../lib/utils.jsx";
import { InfoTip } from "../components/InfoTip.jsx";
import { MultiSelectDropdown } from "../components/MultiSelectDropdown.jsx";

// ─── KenaikanView ───────────────────────────────────────────────────
// Tab ketiga, untuk satu rumah sakit:
// 1. Kenaikan antar tahun per kategori besar (Laboratorium, Radiologi, ...),
//    dari /api/kenaikan (kenaikan_tarif di sql/shard/02_rpc.sql).
// 2. Perbandingan antar kelas kamar dalam satu tahun: tiap kelas vs kelas
//    dasar, dari /api/selisih-kelas (selisih_kelas_tarif).
// Keduanya hanya membandingkan item yang 100% sama (selain tahun / kelas yang
// dibandingkan). Daftar RS dan tahunnya datang dari /api/filters (rs_tahun).

const STATS = [
  { key: 'median', label: 'Median', desc: 'nilai tengah % selisih item; tidak terpengaruh beberapa item yang ekstrem' },
  { key: 'mean', label: 'Mean', desc: 'rata-rata biasa % selisih item' },
  { key: 'weighted', label: 'Tertimbang harga', desc: '(total harga pembanding − total harga dasar) ÷ total harga dasar; item mahal berbobot lebih besar' },
  { key: 'q1', label: 'Q1 (25%)', desc: '25% item selisihnya kurang dari angka ini' },
  { key: 'q3', label: 'Q3 (75%)', desc: '75% item selisihnya kurang dari angka ini' },
  { key: 'min', label: 'Min', desc: 'selisih terkecil (paling turun / paling murah)' },
  { key: 'max', label: 'Max', desc: 'selisih terbesar' },
];

// Satu RS = satu seri, jadi satu warna batang (slot pertama palet dataviz).
const BAR_COLOR = '#2a78d6';

const fmtPct = (v) => v == null ? '–'
  : `${v > 0 ? '+' : ''}${v.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtInt = (v) => Number(v).toLocaleString('id-ID');
// "18 (64%)": jumlah item dan porsinya dari n
const fmtShare = (count, n) =>
  `${fmtInt(count)} (${(n ? count / n : 0).toLocaleString('id-ID', { style: 'percent', maximumFractionDigits: 0 })})`;
// Warna teks angka: lebih mahal merah, lebih murah hijau. Batang tidak diwarnai.
const trendClass = (v) => (v > 0 ? 'kn-up' : v < 0 ? 'kn-down' : '');

// Garis bantu sumbu: kelipatan 1/2/5 × 10^n, kira-kira 4 jarak, dari bawah lo
// sampai melewati hi (jadi semua batang muat).
function niceTicks(lo, hi) {
  const raw = (hi - lo) / 4 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw);
  const ticks = [];
  for (let t = Math.floor(lo / step) * step; ; t += step) {
    ticks.push(Math.round(t * 1e6) / 1e6 || 0);
    if (t >= hi - 1e-9) return ticks;
  }
}

// GET JSON untuk url (null = jangan ambil). Data lama tetap dikembalikan selama
// data baru dimuat, supaya tampilan tidak berkedip (lihat .kn-stale).
function useApi(url) {
  const [resp, setResp] = useState({ url: null, data: null, error: null });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then(r => r.json().then(body => {
        if (!r.ok || body.error) throw new Error(body.error || `HTTP ${r.status}`);
        return body;
      }))
      .then(data => { if (!cancelled) setResp({ url, data, error: null }); })
      .catch(err => { if (!cancelled) setResp({ url, data: null, error: err.message }); });
    return () => { cancelled = true; };
  }, [url]);
  return {
    data: url ? resp.data : null,
    error: url && resp.url === url ? resp.error : null,
    loading: Boolean(url) && resp.url !== url,
  };
}

export default function KenaikanView() {
  const [storedFilters] = useState(readStoredFilters);
  const [filters, setFilters] = useState(storedFilters);
  const [filtersLoading, setFiltersLoading] = useState(!storedFilters);
  const [filtersError, setFiltersError] = useState(false);
  // null = belum diubah pengguna (pakai pilihan bawaan)
  const [rsSel, setRsSel] = useState(null);       // string
  const [tahunSel, setTahunSel] = useState(null); // { rs, list: number[] }
  const [kelasSel, setKelasSel] = useState(null); // { rs, tahun, kelas? }
  const [stat, setStat] = useState('median');
  const [tip, setTip] = useState(null);           // { row, x, y, title, sub, labels }

  const fetchFilters = useCallback((hasCopy) => {
    fetch(`${API}/filters`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(f => {
        if (f.error) throw new Error(f.error);
        setFilters(f);
        storeFilters(f);
      })
      .catch(err => { console.error(err); if (!hasCopy) setFiltersError(true); })
      .finally(() => setFiltersLoading(false));
  }, []);

  const retryFilters = () => {
    setFiltersLoading(true);
    setFiltersError(false);
    fetchFilters(false);
  };

  useEffect(() => { fetchFilters(Boolean(storedFilters)); }, [fetchFilters, storedFilters]);

  // ─── Rumah sakit dan tahunnya ─────────────────────────────────────
  const hasRsTahun = Array.isArray(filters?.rs_tahun);
  const yearsByRS = new Map();
  for (const { rumah_sakit, tahun } of filters?.rs_tahun ?? []) {
    if (!yearsByRS.has(rumah_sakit)) yearsByRS.set(rumah_sakit, []);
    yearsByRS.get(rumah_sakit).push(Number(tahun));
  }
  const yearsOf = (rs) => (yearsByRS.get(rs) ?? []).slice().sort((a, b) => a - b);
  // RS dengan 2+ tahun di atas (bisa dua-duanya), lalu sisanya; tiap kelompok urut abjad.
  const allRS = (filters?.rumah_sakit ?? []).filter(rs => yearsByRS.has(rs));
  const multiYear = (rs) => yearsOf(rs).length >= 2;
  const rsOptions = [...allRS.filter(multiYear), ...allRS.filter(rs => !multiYear(rs))];
  const rs = rsSel && rsOptions.includes(rsSel) ? rsSel : rsOptions[0] ?? null;
  const rsYears = rs ? yearsOf(rs) : [];

  // Bagian 1: tahun-tahun yang dibandingkan (bawaan: dua tahun terakhir)
  const tahun = (tahunSel?.rs === rs ? tahunSel.list : rsYears.slice(-2))
    .filter(t => rsYears.includes(t)).sort((a, b) => a - b);
  const qs1 = new URLSearchParams({ rumah_sakit: rs ?? '', tahun: tahun.join(',') });
  const naik = useApi(rs && tahun.length >= 2 ? `${API}/kenaikan?${qs1}` : null);

  // Bagian 2: satu tahun (bawaan: terbaru) + kelas dasar (bawaan: dari API)
  const kelasMine = kelasSel?.rs === rs ? kelasSel : null;
  const kelasTahun = kelasMine?.tahun && rsYears.includes(kelasMine.tahun) ? kelasMine.tahun : rsYears.at(-1);
  const kelasDasar = kelasMine?.tahun === kelasTahun ? kelasMine.kelas ?? null : null;
  const qs2 = new URLSearchParams({ rumah_sakit: rs ?? '', tahun: String(kelasTahun ?? '') });
  if (kelasDasar) qs2.set('kelas', kelasDasar);
  const kelas = useApi(rs && kelasTahun ? `${API}/selisih-kelas?${qs2}` : null);

  const statInfo = STATS.find(s => s.key === stat);

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <main className="main">
      <div className="search-card">
        <div className="search-label">Kenaikan &amp; Selisih Harga per Kategori Besar</div>
        <div className="filter-zone" aria-busy={filtersLoading}>
          <div className="filter-row">
            <MultiSelectDropdown
              single
              label="Rumah Sakit"
              emptyLabel="Pilih Rumah Sakit"
              options={rsOptions}
              selected={rs ? [rs] : []}
              onChange={([v]) => setRsSel(v)}
              formatLabel={r => `${r} · ${yearsOf(r).join(', ')}`}
            />
          </div>
          {filtersLoading && (
            <div className="filter-overlay" role="status">
              <span className="spinner" /> Memuat daftar rumah sakit
            </div>
          )}
          {!filtersLoading && filtersError && (
            <div className="filter-overlay filter-overlay-error" role="alert">
              Daftar rumah sakit gagal dimuat.
              <button className="filter-retry-btn" onClick={retryFilters}>Coba lagi</button>
            </div>
          )}
        </div>
        <div className="kn-stat-row">
          <span className="kn-stat-label">Statistik</span>
          <div className="view-tabs kn-stat-tabs" role="radiogroup" aria-label="Statistik">
            {STATS.map(s => (
              <button
                key={s.key}
                role="radio"
                aria-checked={stat === s.key}
                className={`view-tab ${stat === s.key ? 'active' : ''}`}
                onClick={() => setStat(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <p className="kn-note">
          <b>{statInfo.label}</b>: {statInfo.desc}.{' '}
          Hanya item yang <b>sama persis</b> yang dibandingkan (beda spasi atau huruf pun dianggap
          item lain). Angka <span className="kn-up">merah = lebih mahal</span>,{' '}
          <span className="kn-down">hijau = lebih murah</span>.
        </p>
      </div>

      {!hasRsTahun && filters && !filtersLoading && (
        <div className="state-box">
          <div className="state-title">Daftar tahun per rumah sakit belum tersedia</div>
          <div className="state-sub">Jalankan <code>02_rpc.sql</code> lalu <code>select refresh_filters();</code> di tiap shard.</div>
        </div>
      )}

      {rs && (
        <>
          {/* ─── Bagian 1: antar tahun ─── */}
          <section className="kn-section">
            <div className="kn-section-head">
              <h2 className="kn-section-title">Kenaikan antar tahun</h2>
              {rsYears.length >= 2 && (
                <MultiSelectDropdown
                  label="Tahun"
                  emptyLabel="Pilih Tahun"
                  options={rsYears}
                  selected={tahun}
                  onChange={v => setTahunSel({ rs, list: v.map(Number) })}
                />
              )}
              <InfoTip label="Cara hitung kenaikan">
                Item harus sama persis di kedua tahun: nama layanan, kategori, dan kelas kamar.
                % kenaikan per item = (harga tahun akhir − harga tahun awal) ÷ harga tahun awal.
                Beberapa harga dalam satu tahun dirata-rata; harga 0 di tahun awal dilewati. Tiap
                tahun dibandingkan dengan tahun berikutnya yang dipilih.
              </InfoTip>
            </div>
            {rsYears.length < 2 ? (
              <div className="kn-empty">RS ini baru punya data {rsYears.join(', ')} saja; kenaikan antar tahun butuh minimal 2 tahun.</div>
            ) : tahun.length < 2 ? (
              <div className="kn-empty">Pilih minimal 2 tahun.</div>
            ) : (
              <ApiBlock api={naik}>
                {d => (
                  <>
                    <Charts data={d} rs={rs} stat={stat} setTip={setTip} />
                    <StatsTable data={d} />
                  </>
                )}
              </ApiBlock>
            )}
          </section>

          {/* ─── Bagian 2: antar kelas ─── */}
          <section className="kn-section">
            <div className="kn-section-head">
              <h2 className="kn-section-title">Perbandingan antar kelas kamar</h2>
              <MultiSelectDropdown
                single
                label="Tahun"
                options={[...rsYears].reverse()}
                selected={kelasTahun ? [kelasTahun] : []}
                onChange={([v]) => setKelasSel({ rs, tahun: Number(v) })}
              />
              {kelas.data?.kelas?.length > 0 && (
                <MultiSelectDropdown
                  single
                  label="Kelas dasar"
                  options={kelas.data.kelas.map(k => k.kelas)}
                  selected={kelas.data.kelas_dasar ? [kelas.data.kelas_dasar] : []}
                  onChange={([v]) => setKelasSel({ rs, tahun: kelasTahun, kelas: v })}
                  formatLabel={k => `vs ${k}`}
                />
              )}
              <InfoTip label="Cara hitung selisih kelas">
                Item harus sama persis selain kelasnya: rumah sakit, nama layanan, kategori, dan
                tahun. % selisih per item = (harga kelas itu − harga kelas dasar) ÷ harga kelas
                dasar. Beberapa harga untuk item dan kelas yang sama dirata-rata; harga 0 di kelas
                dasar dilewati; item tanpa kelas kamar tidak ikut. Nama kelas persis seperti di
                data RS. Kolom diurutkan dari kelas yang paling murah ke yang paling mahal.
              </InfoTip>
            </div>
            <ApiBlock api={kelas}>
              {d => <KelasTable data={d} tahun={kelasTahun} stat={stat} setTip={setTip} />}
            </ApiBlock>
          </section>
        </>
      )}

      {tip && <Tooltip tip={tip} stat={stat} />}
    </main>
  );
}

// Status muat/galat untuk satu bagian; isi digambar oleh children(data).
function ApiBlock({ api, children }) {
  if (api.error) {
    return (
      <div className="state-box kn-error" role="alert">
        <div className="state-title">Terjadi kesalahan</div>
        <div className="state-sub">{api.error}</div>
      </div>
    );
  }
  if (!api.data) return <div className="kn-empty"><span className="spinner" /></div>;
  return (
    <div className={api.loading ? 'kn-stale' : ''}>
      {api.data.partial && (
        <div className="kn-warning" role="status">
          Sebagian data tidak tersedia (shard {api.data.failedShards?.join(', ')} tidak merespons).
        </div>
      )}
      {children(api.data)}
    </div>
  );
}

// Posisi tooltip dari event pointer, atau dari kotak elemen saat fokus keyboard.
const tipAt = (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.type === 'focus' ? { x: rect.right, y: rect.top } : { x: e.clientX, y: e.clientY };
};

const LABELS_TAHUN = ['Naik', 'Tetap', 'Turun'];
const LABELS_KELAS = ['Lebih mahal', 'Sama', 'Lebih murah'];

function Charts({ data, rs, stat, setTip }) {
  if (!data.periods.length) {
    return <div className="kn-empty">Tidak ada item yang sama persis di tahun-tahun yang dipilih.</div>;
  }
  const byKey = new Map(data.rows.map(r => [`${r.from}|${r.kategori_besar}`, r]));

  // Satu skala untuk semua panel, supaya batang antarperiode bisa dibandingkan.
  const values = data.rows.map(r => r[stat]).filter(v => v != null);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const lo = Math.min(0, ticks[0]);
  const hi = Math.max(0, ticks[ticks.length - 1]);
  const pos = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  // Ruang di kiri/kanan area batang untuk label angka di ujungnya
  const gutters = { '--kn-gl': lo < 0 ? '50px' : '0px' };

  const showTip = (row) => (e) => setTip({
    row, ...tipAt(e),
    title: row.kategori_besar,
    sub: `${rs} · ${row.from} → ${row.to}`,
    labels: LABELS_TAHUN,
  });
  const hideTip = () => setTip(null);

  return (
    <div className="kn-panels">
      {data.periods.map(p => {
        const hasRows = data.rows.some(r => r.from === p.from);
        const outside = !hasRows && data.unmapped.some(u => u.from === p.from);
        return (
          <section key={p.from} className="kn-panel" style={gutters}>
            <h3 className="kn-panel-title">{p.from} → {p.to}</h3>
            {data.kategori.map(k => {
              const row = byKey.get(`${p.from}|${k}`);
              const v = row?.[stat];
              return (
                <div key={k} className="kn-group">
                  <div className="kn-group-label">{k}</div>
                  <div className="kn-bars">
                    <div className="kn-track">
                      <span className="kn-zero" style={{ left: `${pos(0)}%` }} />
                      {v == null ? (
                        <span className="kn-none" style={{ left: `calc(${pos(0)}% + 6px)` }}>tidak ada item</span>
                      ) : (
                        <>
                          <span
                            className={`kn-bar ${v < 0 ? 'neg' : ''}`}
                            tabIndex={0}
                            aria-label={`${k}: ${fmtPct(v)}`}
                            style={{
                              left: `${pos(Math.min(0, v))}%`,
                              width: `max(${Math.abs(pos(v) - pos(0))}%, 2px)`,
                              background: BAR_COLOR,
                            }}
                            onPointerMove={showTip(row)}
                            onPointerLeave={hideTip}
                            onFocus={showTip(row)}
                            onBlur={hideTip}
                          />
                          <span
                            className={`kn-value ${trendClass(v)}`}
                            style={v < 0
                              ? { right: `calc(${100 - pos(v)}% + 5px)` }
                              : { left: `calc(${pos(v)}% + 5px)` }}
                          >
                            {fmtPct(v)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="kn-axis">
              <div className="kn-group-label" />
              <div className="kn-axis-ticks">
                <div className="kn-tick-area">
                  {ticks.map(t => (
                    <span key={t} className={`kn-tick ${t === 0 ? 'zero' : ''}`} style={{ left: `${pos(t)}%` }}>{fmtPct(t).replace(',0%', '%')}</span>
                  ))}
                </div>
              </div>
            </div>
            {!hasRows && (
              <div className="kn-panel-note">
                {outside
                  ? 'Semua item yang dibandingkan berada di luar 5 kategori.'
                  : `Tidak ada item yang sama di ${p.from} dan ${p.to}.`}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// Tooltip di dekat pointer, tapi selalu utuh di dalam layar: setelah diukur,
// pindah ke kiri/atas pointer kalau tidak muat, lalu dijepit 8px dari tepi.
// Dirender di <body> (portal): .main punya transform dari animasinya, dan di
// dalamnya position: fixed tidak lagi dihitung dari layar.
const TIP_GAP = 14;
const TIP_MARGIN = 8;
function Tooltip({ tip, stat }) {
  const { row, labels } = tip;
  const ref = useRef(null);
  const [place, setPlace] = useState(null);

  useLayoutEffect(() => {
    const { width, height } = ref.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let left = tip.x + TIP_GAP;
    if (left + width > vw - TIP_MARGIN) left = tip.x - TIP_GAP - width;
    let top = tip.y + TIP_GAP;
    if (top + height > vh - TIP_MARGIN) top = tip.y - TIP_GAP - height;
    const clamp = (v, size, max) => Math.max(TIP_MARGIN, Math.min(v, max - size - TIP_MARGIN));
    setPlace({ left: clamp(left, width, vw), top: clamp(top, height, vh) });
  }, [tip.x, tip.y, row]);

  return createPortal(
    <div
      ref={ref}
      className="kn-tip"
      style={place ?? { left: 0, top: 0, visibility: 'hidden' }}
      role="tooltip"
    >
      <div className={`kn-tip-value ${trendClass(row[stat])}`}>{fmtPct(row[stat])}</div>
      <div className="kn-tip-title">{tip.title}</div>
      <div className="kn-tip-sub">{tip.sub}</div>
      <table className="kn-tip-table">
        <tbody>
          {STATS.map(s => (
            <tr key={s.key} className={s.key === stat ? 'active' : ''}>
              <td>{s.label}</td><td className={trendClass(row[s.key])}>{fmtPct(row[s.key])}</td>
            </tr>
          ))}
          <tr><td>Item dibandingkan</td><td>{fmtInt(row.n)}</td></tr>
          <tr className="kn-tip-sep"><td>{labels[0]}</td><td className="kn-up">{fmtShare(row.naik, row.n)}</td></tr>
          <tr><td>{labels[1]}</td><td>{fmtShare(row.tetap, row.n)}</td></tr>
          <tr><td>{labels[2]}</td><td className="kn-down">{fmtShare(row.turun, row.n)}</td></tr>
        </tbody>
      </table>
    </div>,
    document.body,
  );
}

function StatsTable({ data }) {
  const rows = [...data.rows].sort((a, b) => a.from - b.from
    || data.kategori.indexOf(a.kategori_besar) - data.kategori.indexOf(b.kategori_besar));
  if (!rows.length) return null;
  return (
    <>
      <div className="kn-table-title">Semua statistik</div>
      <div className="table-wrap">
        <table className="kn-table">
          <thead>
            <tr>
              <th>Periode</th><th>Kategori besar</th>
              <th className="right">Item</th>
              {STATS.map(s => <th key={s.key} className="right">{s.label}</th>)}
              {LABELS_TAHUN.map(l => <th key={l} className="right">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.from}|${r.kategori_besar}`}>
                <td>{r.from} → {r.to}</td>
                <td>{r.kategori_besar}</td>
                <td className="right">{fmtInt(r.n)}</td>
                {STATS.map(s => <td key={s.key} className={`right ${trendClass(r[s.key])}`}>{fmtPct(r[s.key])}</td>)}
                <td className="right kn-up">{fmtShare(r.naik, r.n)}</td>
                <td className="right">{fmtShare(r.tetap, r.n)}</td>
                <td className="right kn-down">{fmtShare(r.turun, r.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.unmapped.length > 0 && (
        <div className="kn-unmapped">
          Tidak termasuk 5 kategori (tidak dihitung):{' '}
          {data.unmapped.map(u => `${u.from}→${u.to}: ${fmtInt(u.n)} item`).join(' · ')}
        </div>
      )}
    </>
  );
}

// Baris = 5 kategori besar, kolom = kelas lain (urut termurah → termahal),
// sel = statistik terpilih dari % selisih terhadap kelas dasar.
function KelasTable({ data, tahun, stat, setTip }) {
  if (!data.kelas.length) {
    return <div className="kn-empty">RS ini tidak punya data kelas kamar di {tahun}.</div>;
  }
  if (!data.kolom.length) {
    return (
      <div className="kn-empty">
        Tidak ada item di 5 kategori yang sama persis antara {data.kelas_dasar} dan kelas lain di {tahun}.
      </div>
    );
  }
  const byKey = new Map(data.rows.map(r => [`${r.kategori_besar}|${r.kelas}`, r]));
  const showTip = (row) => (e) => setTip({
    row, ...tipAt(e),
    title: `${row.kelas} vs ${data.kelas_dasar}`,
    sub: `${row.kategori_besar} · ${tahun}`,
    labels: LABELS_KELAS,
  });
  const hideTip = () => setTip(null);

  return (
    <>
      <div className="table-wrap">
        <table className="kn-table kn-kelas-table">
          <thead>
            <tr>
              <th>Kategori besar</th>
              {data.kolom.map(k => (
                <th key={k} className="right">
                  <div className="kn-kelas-name">{k}</div>
                  <div className="kn-kelas-sub">vs {data.kelas_dasar}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.kategori.map(kat => (
              <tr key={kat}>
                <td className="kn-kelas-kat">{kat}</td>
                {data.kolom.map(k => {
                  const row = byKey.get(`${kat}|${k}`);
                  if (!row) return <td key={k} className="right kn-cell-empty">–</td>;
                  return (
                    <td
                      key={k}
                      className={`right kn-cell ${trendClass(row[stat])}`}
                      tabIndex={0}
                      aria-label={`${kat}, ${k} vs ${data.kelas_dasar}: ${fmtPct(row[stat])}, ${row.n} item`}
                      onPointerMove={showTip(row)}
                      onPointerLeave={hideTip}
                      onFocus={showTip(row)}
                      onBlur={hideTip}
                    >
                      <div className="kn-cell-value">{fmtPct(row[stat])}</div>
                      <div className="kn-cell-n">{fmtInt(row.n)} item</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="kn-unmapped">
        Jumlah item per kelas di {tahun}:{' '}
        {data.kelas.map(k => `${k.kelas} ${fmtInt(k.n)}`).join(' · ')}.
        {data.tanpa_pasangan.length > 0 && (
          <> Tidak ada item yang sama dengan {data.kelas_dasar}: {data.tanpa_pasangan.join(', ')}.</>
        )}
        {data.unmapped.length > 0 && (
          <> Item di luar 5 kategori (tidak dihitung): {data.unmapped.map(u => `${u.kelas} ${fmtInt(u.n)}`).join(' · ')}.</>
        )}
      </div>
    </>
  );
}
