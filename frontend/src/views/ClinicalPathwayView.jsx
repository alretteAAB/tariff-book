import { useState, useEffect, useMemo, useCallback } from "react";
import { API, formatRupiah } from "../lib/utils.jsx";
import { MultiSelectDropdown } from "../components/MultiSelectDropdown.jsx";

// ─── ClinicalPathwayView ────────────────────────────────────────────
// Tab "Clinical Pathway": harga paket perawatan per rumah sakit × diagnosis ×
// medical treatment, satu card per kombinasi, dengan harga total tiap kelas
// dan LOS. Card dibuka untuk melihat rinciannya (diambil saat dibuka).
// Data di project Supabase golongan (sql/golongan/04_clinical_pathway.sql),
// di-upload dengan scripts/upload_clinical_pathway.py.

const NONE = [];
// Harga di sumber datanya ada sennya (mis. 13.346.960,87); ditampilkan per rupiah.
const fmtHarga = (v) => formatRupiah(Math.round(Number(v)));
const kelasLabel = (k) => (/^kelas\s/i.test(k) ? `Kelas ${k.replace(/^kelas\s*/i, '')}` : k);
const fmtQty = (q) => (q == null ? '–' : Number(q).toLocaleString('id-ID'));

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
  const [open, setOpen] = useState(() => new Set());        // ids of expanded cards
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

  const toggle = (id) => {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    const r = rincian.get(id);
    if (!r || r.error) loadRincian(id);
  };

  const list = cards.data ?? NONE;
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
          Harga total paket per kelas. Buka card untuk melihat rincian kegiatan, item, dan jumlahnya.
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
              <div className="state-sub">Tidak ada paket untuk kombinasi filter ini.</div></div>
          )}
          <div className={`cp-list ${cards.loading ? 'kn-stale' : ''}`}>
            {list.map(c => (
              <PathwayCard key={c.id} card={c} isOpen={open.has(c.id)} onToggle={() => toggle(c.id)}
                rincian={rincian.get(c.id)} onRetry={() => loadRincian(c.id)} />
            ))}
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

function PathwayCard({ card, isOpen, onToggle, rincian, onRetry }) {
  const bodyId = `cp-body-${card.id}`;
  return (
    <section className={`cp-card ${isOpen ? 'open' : ''}`}>
      <button className="cp-head" onClick={onToggle} aria-expanded={isOpen} aria-controls={bodyId}>
        <div className="cp-title-wrap">
          <div className="cp-rs">{card.rumah_sakit}</div>
          <div className="cp-title">{card.medical_treatment}</div>
          <div className="cp-sub">
            <span>{card.diagnosis}</span>
            {card.icd10 && <span className="cp-chip">ICD {card.icd10}</span>}
            {card.los != null && <span className="cp-chip">LOS {card.los} hari</span>}
          </div>
        </div>
        <div className="cp-prices">
          {card.harga.map(h => (
            <div key={h.kelas} className="cp-price">
              <div className="cp-price-label">{kelasLabel(h.kelas)}</div>
              {Number(h.tarif) > 0
                ? <div className="cp-price-value">{fmtHarga(h.tarif)}</div>
                : <div className="cp-price-none">Belum tersedia</div>}
            </div>
          ))}
        </div>
        <span className="cp-chevron" aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="cp-body" id={bodyId}>
          <Rincian state={rincian} onRetry={onRetry} />
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
    <div className="table-wrap cp-table-wrap">
      <table className="kn-table cp-table">
        <thead>
          <tr><th>Item</th><th>Keterangan</th><th className="right">QTY</th></tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => [
            <tr key={`g${gi}`} className="cp-group-row"><td colSpan={3}>{g.kegiatan || '—'}</td></tr>,
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
