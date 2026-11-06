import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { API, formatRupiah } from "../lib/utils.jsx";
import { MultiSelectDropdown } from "../components/MultiSelectDropdown.jsx";

// ─── ClinicalPathwayView ────────────────────────────────────────────
// Tab "Clinical Pathway": harga paket perawatan per rumah sakit × diagnosis ×
// medical treatment, satu card per kombinasi, dengan harga total tiap kelas
// dan LOS. Memilih card membuka panel detail di kanan (daftar card menyempit
// ke kiri); rinciannya diambil saat panel dibuka. Di layar sempit panel
// menggantikan daftar, dengan tombol kembali.
// Data di project Supabase golongan (sql/golongan/04_clinical_pathway.sql),
// di-upload dengan scripts/upload_clinical_pathway.py.

const NONE = [];
// Harga di sumber datanya ada sennya (mis. 13.346.960,87); ditampilkan per rupiah.
const fmtHarga = (v) => formatRupiah(Math.round(Number(v)));
// Urutan kelas: VVIP/SVIP, VIP, Kelas 1, 2, 3, ODS, lalu kelas lain (A-Z).
function kelasRank(k) {
  const s = String(k).trim().toUpperCase();
  if (/^(VVIP|SVIP|SUITE|PRESIDEN)/.test(s)) return 0;
  if (/^VIP/.test(s)) return 1;
  const m = s.match(/^(KELAS|KLS)\.?\s*(\d+|I{1,3})\b/);
  if (m) return 1 + (/^\d/.test(m[2]) ? Number(m[2]) : m[2].length);
  if (s === 'ODS') return 10;
  return 20;
}
const byKelas = (a, b) => kelasRank(a) - kelasRank(b) || String(a).localeCompare(String(b));
const sortHarga = (harga) => [...harga].sort((a, b) => byKelas(a.kelas, b.kelas));
const kelasLabel = (k) => (/^kelas\s/i.test(k) ? `Kelas ${k.replace(/^kelas\s*/i, '')}` : k);
const fmtQty = (q) => (q == null ? '–' : Number(q).toLocaleString('id-ID'));
// Harga 0 = paket belum ditawarkan di kelas itu. Paket tanpa satu pun harga
// tidak menampilkan rinciannya (datanya tetap disimpan di database).
const isOffered = (card) => card.harga.some(h => Number(h.tarif) > 0);

// Nilai `key` dari relasi yang cocok dengan semua pilihan lain (kosong = semua),
// dalam urutan daftar `all`.
function narrow(all, relations, key, picked) {
  const active = Object.entries(picked).filter(([, v]) => v.length);
  if (!active.length) return all;
  const sets = active.map(([k, v]) => [k, new Set(v)]);
  const keep = new Set();
  for (const r of relations) if (sets.every(([k, s]) => s.has(r[k]))) keep.add(r[key]);
  return all.filter(v => keep.has(v));
}

// GET JSON; data lama tetap ditampilkan selama data baru dimuat.
function useApi(url) {
  const [resp, setResp] = useState({ url: null, data: null, error: null });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then(r => r.json().then(body => {
        if (!r.ok || body?.error) throw new Error(body?.error || `HTTP ${r.status}`);
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

export default function ClinicalPathwayView() {
  const [selRS, setSelRS] = useState(NONE);
  const [selDiag, setSelDiag] = useState(NONE);
  const [selMT, setSelMT] = useState(NONE);
  const [selectedId, setSelectedId] = useState(null);
  const [rincian, setRincian] = useState(() => new Map());  // id -> { data, error }

  const filters = useApi(`${API}/clinical-pathway/filters`);
  const f = filters.data;
  const relations = f?.relations ?? NONE;

  const rsOptions = f?.rumah_sakit ?? NONE;
  const diagOptions = useMemo(
    () => narrow(f?.diagnosis ?? NONE, relations, 'diagnosis', { rumah_sakit: selRS }),
    [f, relations, selRS]);
  const mtOptions = useMemo(
    () => narrow(f?.medical_treatment ?? NONE, relations, 'medical_treatment', { rumah_sakit: selRS, diagnosis: selDiag }),
    [f, relations, selRS, selDiag]);

  // Pilihan yang tidak lagi tersedia setelah filter lain berubah ikut dilepas.
  const diag = useMemo(() => selDiag.filter(d => diagOptions.includes(d)), [selDiag, diagOptions]);
  const mt = useMemo(() => selMT.filter(m => mtOptions.includes(m)), [selMT, mtOptions]);

  const qs = new URLSearchParams();
  selRS.forEach(v => qs.append('rumah_sakit', v));
  diag.forEach(v => qs.append('diagnosis', v));
  mt.forEach(v => qs.append('medical_treatment', v));
  const cards = useApi(f ? `${API}/clinical-pathway?${qs}` : null);

  const loadRincian = useCallback((id) => {
    setRincian(prev => (prev.has(id) ? prev : new Map(prev).set(id, { data: null, error: null })));
    fetch(`${API}/clinical-pathway/rincian?id=${id}`)
      .then(r => r.json().then(body => {
        if (!r.ok || body?.error) throw new Error(body?.error || `HTTP ${r.status}`);
        return body;
      }))
      .then(data => setRincian(prev => new Map(prev).set(id, { data, error: null })))
      .catch(err => setRincian(prev => new Map(prev).set(id, { data: null, error: err.message })));
  }, []);

  const list = cards.data ?? NONE;
  // Semua kelas di daftar ini: di layar lebar tiap kelas punya kolom sendiri
  // di semua card, jadi Kelas 1 selalu di bawah Kelas 1 walau ada RS dengan VIP.
  const kelasCols = useMemo(
    () => [...new Set(list.flatMap(c => c.harga.map(h => h.kelas)))].sort(byKelas), [list]);
  // Card yang terbuka hilang dari daftar (filter berubah) -> panel ikut tertutup.
  const selected = list.find(c => c.id === selectedId) ?? null;

  const open = (card) => {
    setSelectedId(card.id);
    const r = rincian.get(card.id);
    if (isOffered(card) && (!r || r.error)) loadRincian(card.id);
  };
  const close = useCallback(() => {
    const id = selectedId;
    setSelectedId(null);
    // fokus kembali ke card yang tadi dibuka
    requestAnimationFrame(() => document.getElementById(`cp-card-${id}`)?.focus());
  }, [selectedId]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, close]);

  const resetFilters = () => { setSelRS(NONE); setSelDiag(NONE); setSelMT(NONE); };

  return (
    <main className="main">
      <div className="search-card">
        <div className="search-label">Clinical Pathway</div>
        <div className="filter-zone" aria-busy={filters.loading}>
          <div className="filter-row">
            <MultiSelectDropdown label="Rumah Sakit" options={rsOptions} selected={selRS} onChange={setSelRS} />
            <MultiSelectDropdown label="Diagnosis" options={diagOptions} selected={diag} onChange={setSelDiag} />
            <MultiSelectDropdown label="Medical Treatment" options={mtOptions} selected={mt} onChange={setSelMT} />
            {(selRS.length > 0 || diag.length > 0 || mt.length > 0) && (
              <button className="filter-retry-btn" onClick={resetFilters}>Hapus filter</button>
            )}
          </div>
          {filters.loading && (
            <div className="filter-overlay" role="status"><span className="spinner" /> Memuat daftar filter</div>
          )}
        </div>
        <p className="kn-note">
          Harga total paket per kelas. Pilih paket untuk melihat rincian kegiatan, item, dan jumlahnya.
        </p>
      </div>

      {filters.error && <ErrorBox message={filters.error} />}
      {cards.error && <ErrorBox message={cards.error} />}

      {f && !cards.error && (
        <>
          <div className="results-meta">
            <div className="results-count">
              {cards.loading && !cards.data ? 'Memuat…' : <>Menampilkan <strong>{list.length.toLocaleString('id-ID')}</strong> paket</>}
            </div>
          </div>
          {cards.data && !list.length && (
            <div className="state-box"><div className="state-title">Tidak ada paket</div>
              <div className="state-sub">Tidak ada paket untuk kombinasi filter ini. Hapus salah satu filter untuk melihat paket lain.</div></div>
          )}
          <div className={`cp-layout ${selected ? 'has-detail' : ''}`} style={{ '--cp-slots': kelasCols.length || 1 }}>
            <div className={`cp-list ${cards.loading ? 'kn-stale' : ''}`}>
              {list.map(c => (
                <PathwayCard key={c.id} card={c} kelasCols={kelasCols} selected={c.id === selectedId} onOpen={() => open(c)} />
              ))}
            </div>
            {selected && (
              <DetailPanel key={selected.id} card={selected} rincian={rincian.get(selected.id)}
                onRetry={() => loadRincian(selected.id)} onClose={close} />
            )}
          </div>
        </>
      )}
    </main>
  );
}

function ErrorBox({ message }) {
  return (
    <div className="state-box kn-error" role="alert">
      <div className="state-title">Terjadi kesalahan</div>
      <div className="state-sub">{message}</div>
    </div>
  );
}

function Prices({ harga, className }) {
  return (
    <dl className={className}>
      {sortHarga(harga).map(h => (
        <div key={h.kelas} className="cp-price">
          <dt>{kelasLabel(h.kelas)}</dt>
          <dd>{Number(h.tarif) > 0 ? fmtHarga(h.tarif) : <span className="cp-price-none">Belum tersedia</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

// Harga di card: satu sel per kelas di daftar (kelas yang tidak dimiliki RS
// ini tampil "—" di layar lebar dan disembunyikan di layar sempit). --cols:
// jumlah kolom di layar sempit (4 kelas jadi 2 x 2).
function CardPrices({ harga, kelasCols }) {
  const own = new Map(harga.map(h => [h.kelas, h]));
  const n = own.size;
  const cols = n <= 3 ? Math.max(n, 1) : n === 4 ? 2 : 3;
  return (
    <dl className="cp-prices" style={{ '--cols': cols }}>
      {kelasCols.map(k => {
        const h = own.get(k);
        if (!h) {
          return (
            <div key={k} className="cp-price cp-price-missing" aria-hidden="true">
              <dt>{kelasLabel(k)}</dt><dd>—</dd>
            </div>
          );
        }
        return (
          <div key={k} className="cp-price">
            <dt>{kelasLabel(k)}</dt>
            <dd>{Number(h.tarif) > 0 ? fmtHarga(h.tarif) : <span className="cp-price-none">Belum tersedia</span>}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function PathwayCard({ card, kelasCols, selected, onOpen }) {
  // satu baris kolom: ICD 10 | Diagnosis | Medical Treatment | LOS
  // (daftar diurutkan menurut ICD 10, jadi kodenya di kiri dan paling tegas)
  const fields = [
    ['ICD 10', card.icd10 || '—', 'cp-field-icd'],
    ['Diagnosis', card.diagnosis, 'cp-field-diag'],
    ['Medical Treatment', card.medical_treatment || '—', 'cp-field-mt'],
    ['LOS', card.los != null ? `${card.los} hari` : '—', 'cp-field-los'],
  ];
  return (
    <button id={`cp-card-${card.id}`} className={`cp-card ${selected ? 'selected' : ''}`}
      onClick={onOpen} aria-pressed={selected} aria-controls={selected ? 'cp-detail' : undefined}>
      <span className="cp-card-text">
        <span className="cp-rs">{card.rumah_sakit}</span>
        <span className="cp-fields">
          {fields.map(([label, value, cls]) => (
            <span key={label} className={`cp-field ${cls}`}>
              <span className="cp-field-label">{label}</span>
              <span className="cp-field-value">{value}</span>
            </span>
          ))}
        </span>
      </span>
      {/* harga paket yang sedang dibuka pindah ke panel detail */}
      {!selected && <CardPrices harga={card.harga} kelasCols={kelasCols} />}
    </button>
  );
}

function DetailPanel({ card, rincian, onRetry, onClose }) {
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  const facts = [
    ['ICD 10', card.icd10 || '—', 'cp-fact-icd'],
    ['Diagnosis', card.diagnosis],
    ['Medical Treatment', card.medical_treatment || '—'],
    ['LOS', card.los != null ? `${card.los} hari` : '—'],
  ];
  const offered = isOffered(card);
  return (
    <section id="cp-detail" className="cp-detail" aria-labelledby="cp-detail-title">
      {/* bagian atas tetap terlihat saat rincian di-scroll, supaya jelas paket mana yang dibaca */}
      <div className="cp-detail-head">
        <div className="cp-detail-bar">
          <button className="cp-back" onClick={onClose}>← Kembali ke daftar</button>
          <h2 id="cp-detail-title" className="cp-detail-rs" ref={headingRef} tabIndex={-1}>{card.rumah_sakit}</h2>
          <button className="cp-close" onClick={onClose} aria-label="Tutup detail">×</button>
        </div>
        <dl className="cp-facts">
          {facts.map(([label, value, cls]) => (
            <div key={label} className={`cp-fact ${cls ?? ''}`}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
        {offered && (
          <div className="cp-head-prices">
            <h3 className="cp-detail-h3">Harga paket</h3>
            <Prices harga={card.harga} className="cp-prices cp-prices-detail" />
          </div>
        )}
      </div>
      {offered ? (
        <>
          {/* layar sempit: harga ikut di-scroll supaya bagian yang menempel tidak terlalu tinggi */}
          <div className="cp-body-prices">
            <h3 className="cp-detail-h3">Harga paket</h3>
            <Prices harga={card.harga} className="cp-prices cp-prices-detail" />
          </div>
          <h3 className="cp-detail-h3">
            Rincian{rincian?.data ? <span className="cp-count"> · {rincian.data.length} item</span> : null}
          </h3>
          <Rincian state={rincian} onRetry={onRetry} />
        </>
      ) : (
        <div className="cp-unavailable" role="status">
          <p className="cp-unavailable-title">Belum tersedia</p>
          <p className="cp-unavailable-text">
            Rumah Sakit ini belum menyediakan layanan untuk diagnosis
            {card.medical_treatment ? ' dan treatment' : ''} spesifik ini.
          </p>
        </div>
      )}
    </section>
  );
}

// Rincian dikelompokkan per kegiatan (berurutan seperti di sumber datanya).
function Rincian({ state, onRetry }) {
  if (!state || (!state.data && !state.error)) return <div className="cp-loading"><span className="spinner" /></div>;
  if (state.error) {
    return (
      <div className="cp-loading" role="alert">
        Rincian gagal dimuat ({state.error}). <button className="filter-retry-btn" onClick={onRetry}>Coba lagi</button>
      </div>
    );
  }
  const groups = [];
  for (const r of state.data) {
    const last = groups.at(-1);
    if (last && last.kegiatan === r.kegiatan) last.rows.push(r);
    else groups.push({ kegiatan: r.kegiatan, rows: [r] });
  }
  return (
    <div className="cp-table-wrap">
      <table className="cp-table">
        <colgroup><col className="cp-col-item" /><col /><col className="cp-col-qty" /></colgroup>
        <thead>
          <tr><th scope="col">Item</th><th scope="col">Keterangan</th><th scope="col" className="right">QTY</th></tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => [
            <tr key={`g${gi}`} className="cp-group-row"><th scope="rowgroup" colSpan={3}>{g.kegiatan || '—'}</th></tr>,
            ...g.rows.map((r, ri) => (
              <tr key={`${gi}-${ri}`}>
                <td>{r.item || '—'}</td>
                <td className="cp-ket">{r.keterangan || ''}</td>
                <td className="right">{fmtQty(r.qty)}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}
