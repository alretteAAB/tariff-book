import { useState, useEffect, useCallback } from "react";
import { API, readStoredFilters, storeFilters } from "../lib/utils.jsx";
import { InfoTip } from "../components/InfoTip.jsx";
import { MultiSelectDropdown } from "../components/MultiSelectDropdown.jsx";

// ─── KenaikanView ───────────────────────────────────────────────────
// Tab ketiga: kenaikan harga per kategori besar (Laboratorium, Radiologi, ...)
// untuk RS yang punya data 2 tahun atau lebih. Angka dihitung di
// /api/kenaikan dari item yang 100% sama di kedua tahun (lihat
// kenaikan_tarif di sql/shard/02_rpc.sql). Daftar RS dan tahunnya datang dari
// /api/filters (rs_tahun), jadi RS baru otomatis muncul setelah upload.

const STATS = [
  { key: 'median', label: 'Median', desc: 'nilai tengah % kenaikan item; tidak terpengaruh beberapa item yang naik/turun ekstrem' },
  { key: 'mean', label: 'Mean', desc: 'rata-rata biasa % kenaikan item' },
  { key: 'weighted', label: 'Tertimbang harga', desc: '(total harga tahun akhir − total harga tahun awal) ÷ total harga tahun awal; item mahal berbobot lebih besar' },
  { key: 'q1', label: 'Q1 (25%)', desc: '25% item naik kurang dari angka ini' },
  { key: 'q3', label: 'Q3 (75%)', desc: '75% item naik kurang dari angka ini' },
  { key: 'min', label: 'Min', desc: 'kenaikan terkecil (penurunan terbesar)' },
  { key: 'max', label: 'Max', desc: 'kenaikan terbesar' },
];

// Warna per RS (urutan tetap, divalidasi untuk buta warna; lihat skill dataviz).
// Satu RS memegang warnanya selama terpilih, walau RS lain ditambah/dihapus.
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const MAX_RS = PALETTE.length;

const fmtPct = (v) => v == null ? '–'
  : `${v > 0 ? '+' : ''}${v.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtInt = (v) => Number(v).toLocaleString('id-ID');

// Memberi slot warna yang masih kosong ke RS yang baru dipilih.
function assignColors(list, prev = {}) {
  const colors = {};
  for (const rs of list) if (prev[rs] != null) colors[rs] = prev[rs];
  const used = new Set(Object.values(colors));
  for (const rs of list) {
    if (colors[rs] != null) continue;
    const slot = PALETTE.findIndex((_, i) => !used.has(i));
    colors[rs] = slot;
    used.add(slot);
  }
  return colors;
}

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

export default function KenaikanView() {
  const [storedFilters] = useState(readStoredFilters);
  const [filters, setFilters] = useState(storedFilters);
  const [filtersLoading, setFiltersLoading] = useState(!storedFilters);
  const [filtersError, setFiltersError] = useState(false);
  // null = belum diubah pengguna (pakai pilihan bawaan)
  const [rsSel, setRsSel] = useState(null);       // { list, colors }
  const [tahunSel, setTahunSel] = useState(null); // number[]
  const [stat, setStat] = useState('median');
  const [resp, setResp] = useState({ key: null, data: null, error: null });
  const [tip, setTip] = useState(null);           // { row, x, y }

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

  // ─── RS dan tahun ─────────────────────────────────────────────────
  const hasRsTahun = Array.isArray(filters?.rs_tahun);
  const yearsByRS = new Map();
  for (const { rumah_sakit, tahun } of filters?.rs_tahun ?? []) {
    if (!yearsByRS.has(rumah_sakit)) yearsByRS.set(rumah_sakit, []);
    yearsByRS.get(rumah_sakit).push(Number(tahun));
  }
  const rsOptions = filters?.rumah_sakit ?? [];
  const eligible = rsOptions.filter(rs => (yearsByRS.get(rs)?.length ?? 0) >= 2);

  const defaultList = eligible.slice(0, 4);
  const selected = rsSel ?? { list: defaultList, colors: assignColors(defaultList) };
  const changeRS = (list) => setRsSel({ list, colors: assignColors(list, selected.colors) });

  const tahunOptions = [...new Set(selected.list.flatMap(rs => yearsByRS.get(rs) ?? []))].sort((a, b) => a - b);
  const tahun = (tahunSel ?? tahunOptions.slice(-2)).filter(t => tahunOptions.includes(t)).sort((a, b) => a - b);

  // ─── Ambil data ───────────────────────────────────────────────────
  const ready = selected.list.length > 0 && tahun.length >= 2;
  const qs = new URLSearchParams();
  for (const rs of selected.list) qs.append('rumah_sakit', rs);
  qs.set('tahun', tahun.join(','));
  const key = ready ? qs.toString() : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`${API}/kenaikan?${key}`)
      .then(r => r.json().then(body => {
        if (!r.ok || body.error) throw new Error(body.error || `HTTP ${r.status}`);
        return body;
      }))
      .then(data => { if (!cancelled) setResp({ key, data, error: null }); })
      .catch(err => { if (!cancelled) setResp({ key, data: null, error: err.message }); });
    return () => { cancelled = true; };
  }, [key]);

  const loading = ready && resp.key !== key;
  const data = ready && resp.data ? resp.data : null;
  const statInfo = STATS.find(s => s.key === stat);

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <main className="main">
      <div className="search-card">
        <div className="search-label">Kenaikan Harga per Kategori Besar</div>
        <div className="filter-zone" aria-busy={filtersLoading}>
          <div className="filter-row">
            <MultiSelectDropdown
              label="Rumah Sakit"
              emptyLabel="Pilih Rumah Sakit"
              options={rsOptions}
              selected={selected.list}
              onChange={changeRS}
              isDisabled={rs => (yearsByRS.get(rs)?.length ?? 0) < 2 || selected.list.length >= MAX_RS}
              formatLabel={rs => (yearsByRS.get(rs)?.length ?? 0) < 2 ? `${rs} — hanya 1 tahun data` : rs}
            />
            <MultiSelectDropdown
              label="Tahun"
              emptyLabel="Pilih Tahun"
              options={tahunOptions}
              selected={tahun}
              onChange={v => setTahunSel(v.map(Number))}
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
          <span className="kn-stat-label">Statistik di grafik</span>
          <div className="view-tabs kn-stat-tabs" role="radiogroup" aria-label="Statistik di grafik">
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
          Hanya item yang <b>sama persis</b> di kedua tahun yang dibandingkan: rumah sakit, nama
          layanan, kategori, dan kelas kamar harus identik (beda spasi atau huruf pun dianggap item lain).
          <InfoTip label="Cara hitung">
            % kenaikan per item = (harga tahun akhir − harga tahun awal) ÷ harga tahun awal.
            Item dengan beberapa harga dalam satu tahun memakai rata-ratanya; item berharga 0 di
            tahun awal dilewati. Kategori dikelompokkan ke 5 kategori besar menurut file mapping;
            kategori di luar mapping tidak dihitung. Tiap tahun dibandingkan dengan tahun
            berikutnya yang dipilih.
          </InfoTip>
        </p>
      </div>

      {!hasRsTahun && filters && !filtersLoading && (
        <div className="state-box">
          <div className="state-title">Daftar tahun per rumah sakit belum tersedia</div>
          <div className="state-sub">Jalankan <code>02_rpc.sql</code> lalu <code>select refresh_filters();</code> di tiap shard.</div>
        </div>
      )}

      {hasRsTahun && !selected.list.length && (
        <div className="state-box">
          <div className="state-icon">📈</div>
          <div className="state-title">Pilih rumah sakit</div>
          <div className="state-sub">Hanya rumah sakit dengan data 2 tahun atau lebih yang bisa dipilih.</div>
        </div>
      )}

      {hasRsTahun && selected.list.length > 0 && tahun.length < 2 && (
        <div className="state-box">
          <div className="state-title">Pilih minimal 2 tahun</div>
        </div>
      )}

      {ready && resp.key === key && resp.error && (
        <div className="state-box kn-error" role="alert">
          <div className="state-title">Terjadi kesalahan</div>
          <div className="state-sub">{resp.error}</div>
        </div>
      )}

      {ready && loading && !data && (
        <div className="state-box"><div className="spinner" /></div>
      )}

      {data && !(resp.key === key && resp.error) && (
        <div className={loading ? 'kn-stale' : ''}>
          {data.partial && (
            <div className="kn-warning" role="status">
              Sebagian data tidak tersedia (shard {data.failedShards?.join(', ')} tidak merespons).
            </div>
          )}
          <Legend list={selected.list} colors={selected.colors} />
          <Charts data={data} list={selected.list} colors={selected.colors} stat={stat} setTip={setTip} />
          <StatsTable data={data} list={selected.list} colors={selected.colors} />
        </div>
      )}

      {tip && <Tooltip tip={tip} stat={stat} />}
    </main>
  );
}

function Legend({ list, colors }) {
  return (
    <div className="kn-legend">
      {list.map(rs => (
        <span key={rs} className="kn-legend-item">
          <span className="kn-swatch" style={{ background: PALETTE[colors[rs]] }} />
          {rs}
        </span>
      ))}
    </div>
  );
}

function Charts({ data, list, colors, stat, setTip }) {
  if (!data.periods.length) {
    return (
      <div className="state-box">
        <div className="state-title">Belum ada item yang bisa dibandingkan</div>
        <div className="state-sub">Rumah sakit terpilih tidak punya item yang sama persis di tahun-tahun yang dipilih.</div>
      </div>
    );
  }
  const byKey = new Map(data.rows.map(r => [`${r.from}|${r.kategori_besar}|${r.rumah_sakit}`, r]));

  // Satu skala untuk semua panel, supaya batang antarperiode bisa dibandingkan.
  const values = data.rows.map(r => r[stat]).filter(v => v != null);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const lo = Math.min(0, ticks[0]);
  const hi = Math.max(0, ticks[ticks.length - 1]);
  const pos = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  // Ruang di kiri/kanan area batang untuk label angka di ujungnya
  const gutters = { '--kn-gl': lo < 0 ? '50px' : '0px' };

  const showTip = (row) => (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX ?? rect.right;
    const y = e.clientY ?? rect.top;
    setTip({ row, x: e.type === 'focus' ? rect.right : x, y: e.type === 'focus' ? rect.top : y });
  };
  const hideTip = () => setTip(null);

  return (
    <div className="kn-panels">
      {data.periods.map(p => {
        const inPeriod = (rs) => (r) => r.from === p.from && r.rumah_sakit === rs;
        const missing = list.filter(rs => !data.rows.some(inPeriod(rs)));
        const noData = missing.filter(rs => !data.unmapped.some(inPeriod(rs)));
        const outside = missing.filter(rs => !noData.includes(rs));
        return (
          <section key={p.from} className="kn-panel" style={gutters}>
            <h3 className="kn-panel-title">{p.from} → {p.to}</h3>
            {data.kategori.map(k => (
              <div key={k} className="kn-group">
                <div className="kn-group-label">{k}</div>
                <div className="kn-bars">
                  {list.map(rs => {
                    const row = byKey.get(`${p.from}|${k}|${rs}`);
                    const v = row?.[stat];
                    return (
                      <div key={rs} className="kn-track">
                        <span className="kn-zero" style={{ left: `${pos(0)}%` }} />
                        {v == null ? (
                          <span className="kn-none" style={{ left: `calc(${pos(0)}% + 6px)` }}>tidak ada item</span>
                        ) : (
                          <>
                            <span
                              className={`kn-bar ${v < 0 ? 'neg' : ''}`}
                              tabIndex={0}
                              aria-label={`${rs}, ${k}: ${fmtPct(v)}`}
                              style={{
                                left: `${pos(Math.min(0, v))}%`,
                                width: `max(${Math.abs(pos(v) - pos(0))}%, 2px)`,
                                background: PALETTE[colors[rs]],
                              }}
                              onPointerMove={showTip(row)}
                              onPointerLeave={hideTip}
                              onFocus={showTip(row)}
                              onBlur={hideTip}
                            />
                            <span
                              className="kn-value"
                              style={v < 0
                                ? { right: `calc(${100 - pos(v)}% + 5px)` }
                                : { left: `calc(${pos(v)}% + 5px)` }}
                            >
                              {fmtPct(v)}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
            {noData.length > 0 && (
              <div className="kn-panel-note">
                Tidak ada item yang sama di {p.from} dan {p.to}: {noData.join(', ')}
              </div>
            )}
            {outside.length > 0 && (
              <div className="kn-panel-note">
                Semua item yang dibandingkan berada di luar 5 kategori: {outside.join(', ')}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Tooltip({ tip, stat }) {
  const { row } = tip;
  const left = Math.min(tip.x + 14, window.innerWidth - 260);
  return (
    <div className="kn-tip" style={{ left, top: tip.y + 14 }} role="tooltip">
      <div className="kn-tip-value">{fmtPct(row[stat])}</div>
      <div className="kn-tip-title">{row.rumah_sakit}</div>
      <div className="kn-tip-sub">{row.kategori_besar} · {row.from} → {row.to}</div>
      <table className="kn-tip-table">
        <tbody>
          {STATS.map(s => (
            <tr key={s.key} className={s.key === stat ? 'active' : ''}>
              <td>{s.label}</td><td>{fmtPct(row[s.key])}</td>
            </tr>
          ))}
          <tr><td>Item dibandingkan</td><td>{fmtInt(row.n)}</td></tr>
          <tr><td>Naik / tetap / turun</td><td>{fmtInt(row.naik)} / {fmtInt(row.tetap)} / {fmtInt(row.turun)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function StatsTable({ data, list, colors }) {
  const order = new Map(list.map((rs, i) => [rs, i]));
  const rows = [...data.rows].sort((a, b) => a.from - b.from
    || data.kategori.indexOf(a.kategori_besar) - data.kategori.indexOf(b.kategori_besar)
    || order.get(a.rumah_sakit) - order.get(b.rumah_sakit));
  if (!rows.length) return null;
  return (
    <>
      <div className="kn-table-title">Semua statistik</div>
      <div className="table-wrap">
        <table className="kn-table">
          <thead>
            <tr>
              <th>Periode</th><th>Kategori besar</th><th>Rumah sakit</th>
              <th className="right">Item</th>
              {STATS.map(s => <th key={s.key} className="right">{s.label}</th>)}
              <th className="right">Naik / tetap / turun</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.from}|${r.kategori_besar}|${r.rumah_sakit}`}>
                <td className="kn-num-cell">{r.from} → {r.to}</td>
                <td>{r.kategori_besar}</td>
                <td>
                  <span className="kn-swatch" style={{ background: PALETTE[colors[r.rumah_sakit]] }} />
                  {r.rumah_sakit}
                </td>
                <td className="right">{fmtInt(r.n)}</td>
                {STATS.map(s => <td key={s.key} className="right">{fmtPct(r[s.key])}</td>)}
                <td className="right">{fmtInt(r.naik)} / {fmtInt(r.tetap)} / {fmtInt(r.turun)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.unmapped.length > 0 && (
        <div className="kn-unmapped">
          Tidak termasuk 5 kategori (tidak dihitung):{' '}
          {data.unmapped.map(u => `${u.rumah_sakit} ${u.from}→${u.to}: ${fmtInt(u.n)} item`).join(' · ')}
        </div>
      )}
    </>
  );
}
