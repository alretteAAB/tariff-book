import { useState, useEffect, useRef, useCallback } from "react";
import { API, highlight, formatRupiah, scrollToTop } from "../lib/utils.jsx";
import { InfoTip } from "../components/InfoTip.jsx";
import { MultiSelectDropdown } from "../components/MultiSelectDropdown.jsx";
import { Pagination } from "../components/Pagination.jsx";
import { SortPanel } from "../components/SortPanel.jsx";
import { SortableTh } from "../components/SortableTh.jsx";
import CompareView from "./CompareView.jsx";

// Kolom yang bisa diurutkan (urutannya mengikuti urutan kolom tabel).
// `numeric` menentukan arah default saat kolom pertama kali dipilih.
const SORT_FIELDS = [
  { col: 'tahun', label: 'Tahun', numeric: true },
  { col: 'nama_group', label: 'Grup RS' },
  { col: 'rumah_sakit', label: 'Rumah Sakit' },
  { col: 'kategori_harga', label: 'Kategori' },
  { col: 'nama_layanan', label: 'Nama Layanan' },
  { col: 'kelas_kamar', label: 'Kelas Kamar' },
  { col: 'tarif', label: 'Tarif', numeric: true },
  { col: 'pct_increase', label: '% vs Tahun Lalu', numeric: true },
];
const DEFAULT_SORT = [{ col: 'nama_layanan', dir: 'asc' }];
const defaultDirFor = (col) =>
  SORT_FIELDS.find(f => f.col === col)?.numeric ? 'desc' : 'asc';
// Serialisasi daftar urutan ke param query: "col:dir,col:dir"
const serializeSort = (keys) => keys.map(k => `${k.col}:${k.dir}`).join(',');

// ─── TarifView ──────────────────────────────────────────────────────
// Tab utama: pencarian tarif layanan ke /api/search, plus filter bertingkat,
// saran ketik, urutan bertingkat, ekspor, dan matriks perbandingan.
export default function TarifView() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ kategori: [], rumah_sakit: [], tahun: [], kelas_kamar: [], relations: [], kelas_relations: [] });
  const [selectedKategori, setSelectedKategori] = useState([]);
  const [selectedRS, setSelectedRS] = useState([]);
  const [selectedTahun, setSelectedTahun] = useState([]);
  const [selectedKelas, setSelectedKelas] = useState([]);
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(null);
  const [sortKeys, setSortKeys] = useState(DEFAULT_SORT);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState(false);
  const [dots, setDots] = useState(1);
  const [showGuidance, setShowGuidance] = useState(true);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [view, setView] = useState("list"); // 'list' | 'compare'
  // Param pencarian yang sudah "dikomit" (dipakai untuk ekspor & banding,
  // agar konsisten dengan hasil yang tampil — bukan kontrol live)
  const [committedParams, setCommittedParams] = useState("");

  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const suggDebounce = useRef(null);
  const inputRef = useRef(null);
  const suggRef = useRef(null);

  const isMountedRS = useRef(false);

  // Press "/" to focus search
  useEffect(() => {
    function handler(e) {
      if (e.key === '/' && document.activeElement !== inputRef.current &&
          document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Daftar isi dropdown datang dari /api/filters — payloadnya besar (~450 KB) dan
  // bisa makan beberapa detik, jadi statusnya ditampilkan, bukan didiamkan.
  const loadFilters = useCallback(() => {
    setFiltersLoading(true);
    setFiltersError(false);
    fetch(`${API}/filters`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setFilters)
      .catch(err => { console.error(err); setFiltersError(true); })
      .finally(() => setFiltersLoading(false));
  }, []);

  useEffect(() => { loadFilters(); }, [loadFilters]);

  // Titik berjalan: . → .. → ... → .... → ulang. Hanya hidup selama memuat.
  useEffect(() => {
    if (!filtersLoading) return;
    setDots(1);
    const id = setInterval(() => setDots(d => (d % 4) + 1), 350);
    return () => clearInterval(id);
  }, [filtersLoading]);

  useEffect(() => {
    function handler(e) {
      if (suggRef.current && !suggRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSugg(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── Cascading filter logic ───────────────────────────────────────
  const relations = filters.relations || [];
  const kelasRelations = filters.kelas_relations || [];

  // Rumah Sakit selalu menampilkan semua opsi — pilihan Kategori/Kelas Kamar
  // TIDAK menghilangkan kandidat Rumah Sakit (dependensi satu arah saja).
  const availableRS = filters.rumah_sakit;

  const availableKategori = selectedRS.length > 0
    ? filters.kategori.filter(k =>
        relations.some(r => selectedRS.includes(r.rumah_sakit) && r.kategori_harga === k)
      )
    : filters.kategori;

  const availableKelas = selectedRS.length > 0
    ? filters.kelas_kamar.filter(k =>
        kelasRelations.some(r => selectedRS.includes(r.rumah_sakit) && r.kelas_kamar === k)
      )
    : filters.kelas_kamar;

  // Saat Rumah Sakit berubah, buang pilihan Kategori/Kelas Kamar yang tak lagi tersedia
  useEffect(() => {
    if (!isMountedRS.current) { isMountedRS.current = true; return; }
    if (availableKategori.length > 0) {
      setSelectedKategori(prev => prev.filter(k => availableKategori.includes(k)));
    }
    setSelectedKelas(prev => prev.filter(k => availableKelas.includes(k)));
  }, [selectedRS]); // eslint-disable-line react-hooks/exhaustive-deps
  // ─────────────────────────────────────────────────────────────────

  function buildParams(q, kat, rs, thn, kls, pg = 1, keys = DEFAULT_SORT) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    kat.forEach(k => params.append('kategori', k));
    rs.forEach(r => params.append('rumah_sakit', r));
    thn.forEach(t => params.append('tahun', t));
    kls.forEach(c => params.append('kelas_kamar', c));
    params.set('page', pg);
    params.set('sort', serializeSort(keys));
    return params.toString();
  }

  const fetchSuggestions = useCallback((q) => {
    clearTimeout(suggDebounce.current);
    if (!q.trim()) { setSuggestions([]); setShowSugg(false); return; }
    suggDebounce.current = setTimeout(async () => {
      try {
        const p = buildParams(q, selectedKategori, selectedRS, selectedTahun, selectedKelas);
        const res = await fetch(`${API}/suggest?${p}`);
        const data = await res.json();
        setSuggestions(data);
        setShowSugg(data.length > 0);
      } catch { setSuggestions([]); }
    }, 250);
  }, [selectedKategori, selectedRS, selectedTahun, selectedKelas]);

  // Bila filter diubah saat daftar saran sedang terbuka, muat ulang saran agar
  // mengikuti filter terbaru (tanpa ini, daftar lama sebelum filter tetap tampil
  // sampai pengguna mengetik lagi). Hanya berlaku saat dropdown sedang terbuka,
  // jadi tidak memunculkan saran setelah pencarian dikomit.
  useEffect(() => {
    if (query.trim() && showSugg) fetchSuggestions(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKategori, selectedRS, selectedTahun, selectedKelas]);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    fetchSuggestions(val);
  };

  const handleSearch = async (overrideQ, pg = 1, overrideSort) => {
    const q = overrideQ ?? query;
    const hasFilter = selectedKategori.length || selectedRS.length || selectedTahun.length || selectedKelas.length;
    if (!q.trim() && !hasFilter) return;
    setShowSugg(false);
    setLoading(true);
    setSearched(true);
    setError(null);
    setPage(pg);

    // Pencarian baru (halaman 1 tanpa override) → reset ke urutan default
    const fresh = pg === 1 && overrideSort === undefined;
    const keys = overrideSort ?? (fresh ? DEFAULT_SORT : sortKeys);
    if (fresh) setSortKeys(DEFAULT_SORT);

    try {
      const p = buildParams(q, selectedKategori, selectedRS, selectedTahun, selectedKelas, pg, keys);
      // Snapshot param (tanpa peran page) untuk ekspor & banding
      setCommittedParams(buildParams(q, selectedKategori, selectedRS, selectedTahun, selectedKelas, 1, keys));
      const res = await fetch(`${API}/search?${p}`);
      const data = await res.json();
      setResults(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error(err);
      setError('Gagal memuat data. Periksa koneksi dan coba lagi.');
    } finally {
      setLoading(false);
    }
    scrollToTop();
  };

  // Terapkan daftar urutan baru lalu muat ulang dari halaman 1.
  // Daftar kosong jatuh kembali ke urutan default.
  const applySortKeys = (keys) => {
    const next = keys.length ? keys : DEFAULT_SORT;
    setSortKeys(next);
    handleSearch(query, 1, next);
  };

  // Klik header: jadikan kolom ini satu-satunya kunci (toggle arah bila sudah
  // jadi kunci tunggal). Shift+klik: tambah/ubah kolom sebagai tingkat baru.
  const handleHeaderSort = (col, additive) => {
    const idx = sortKeys.findIndex(k => k.col === col);
    if (additive) {
      if (idx === -1) return applySortKeys([...sortKeys, { col, dir: defaultDirFor(col) }]);
      const next = sortKeys.map((k, i) => i === idx ? { ...k, dir: k.dir === 'asc' ? 'desc' : 'asc' } : k);
      return applySortKeys(next);
    }
    const dir = sortKeys.length === 1 && idx === 0
      ? (sortKeys[0].dir === 'asc' ? 'desc' : 'asc')
      : defaultDirFor(col);
    applySortKeys([{ col, dir }]);
  };

  const goToPage = (pg) => handleSearch(query, pg, sortKeys);

  // Ekspor seluruh hasil terfilter (memakai snapshot param yang dikomit).
  // Pakai anchor download agar tidak meninggalkan tab kosong.
  const handleExport = (format) => {
    if (!committedParams) return;
    const a = document.createElement('a');
    a.href = `${API}/export?${committedParams}&format=${format}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleSuggClick = (nama) => {
    setQuery(nama);
    setSuggestions([]);
    setShowSugg(false);
    handleSearch(nama);
  };

  const handleClear = () => {
    setQuery(""); setResults([]);
    setSearched(false); setSuggestions([]);
    setShowSugg(false); setError(null);
    setPage(1); setTotal(0); setTotalPages(0);
    setSortKeys(DEFAULT_SORT);
    setView("list"); setCommittedParams("");
    inputRef.current?.focus();
  };

  // Filter aktif dikelompokkan per kategori (ditampilkan sebagai tabel ringkas)
  const filterGroups = [
    { type: 'tahun', label: 'Tahun', values: selectedTahun, fmt: t => String(t) },
    { type: 'rs', label: 'Rumah Sakit', values: selectedRS, fmt: r => r },
    { type: 'kategori', label: 'Kategori', values: selectedKategori, fmt: k => k.replace('TARIF ', '') },
    { type: 'kelas', label: 'Kelas Kamar', values: selectedKelas, fmt: c => String(c) },
  ].filter(g => g.values.length > 0);

  const removeChip = (chip) => {
    if (chip.type === 'kategori') setSelectedKategori(v => v.filter(x => x !== chip.val));
    if (chip.type === 'rs') setSelectedRS(v => v.filter(x => x !== chip.val));
    if (chip.type === 'tahun') setSelectedTahun(v => v.filter(x => x !== chip.val));
    if (chip.type === 'kelas') setSelectedKelas(v => v.filter(x => x !== chip.val));
  };

  const clearGroup = (type) => {
    if (type === 'kategori') setSelectedKategori([]);
    if (type === 'rs') setSelectedRS([]);
    if (type === 'tahun') setSelectedTahun([]);
    if (type === 'kelas') setSelectedKelas([]);
  };

  const showRS = filters.rumah_sakit?.length > 0;
  // Kolom Rumah Sakit hanya relevan saat datanya multi-RS
  const sortFields = SORT_FIELDS.filter(f => (f.col !== 'rumah_sakit' && f.col !== 'nama_group') || showRS);
  // Sumbu perbandingan yang tersedia (RS hanya bila multi-RS)
  const compareAxes = [
    ...(showRS ? [{ key: 'rumah_sakit', label: 'Rumah Sakit' }] : []),
    { key: 'tahun', label: 'Tahun' },
    { key: 'kelas_kamar', label: 'Kelas Kamar' },
  ];

  return (
    <main className="main">
      <div className="search-card">
        <div className="search-label">Filter</div>
        <div className="filter-zone" aria-busy={filtersLoading}>
          <div className="filter-row">
            <MultiSelectDropdown
              label="Tahun"
              options={filters.tahun || []}
              selected={selectedTahun}
              onChange={setSelectedTahun}
              formatLabel={v => String(v)}
            />
            {showRS && (
              <MultiSelectDropdown
                label="Rumah Sakit"
                options={availableRS}
                selected={selectedRS}
                onChange={setSelectedRS}
              />
            )}
            <MultiSelectDropdown
              label="Kategori"
              options={availableKategori}
              selected={selectedKategori}
              onChange={setSelectedKategori}
            />
            <MultiSelectDropdown
              label="Kelas Kamar"
              options={availableKelas}
              selected={selectedKelas}
              onChange={setSelectedKelas}
            />
          </div>

          {filtersLoading && (
            <div className="filter-overlay" role="status">
              <span className="spinner" />
              <span>
                Memuat data filter
                <span className="loading-dots">{'.'.repeat(dots)}</span>
              </span>
            </div>
          )}

          {!filtersLoading && filtersError && (
            <div className="filter-overlay filter-overlay-error" role="alert">
              <span>⚠️ Gagal memuat data filter.</span>
              <button className="filter-retry-btn" onClick={loadFilters}>Coba lagi</button>
            </div>
          )}
        </div>

        {showGuidance && (
          <div className="filter-guidance">
            <div className="filter-guidance-text">
              <p>⚠️ Sangat disarankan: pilih filter dulu sebelum mencari</p>
              <p>Pilih Tahun → Rumah Sakit → Kategori → Kelas Kamar — hasil & saran pencarian akan lebih akurat dan relevan</p>
            </div>
            <button className="filter-guidance-close" onClick={() => setShowGuidance(false)}>×</button>
          </div>
        )}

        {filterGroups.length > 0 && (
          <div className={`active-filters ${filtersCollapsed ? 'collapsed' : ''}`}>
            <div className="active-filters-header">
              <span className="active-filters-title">
                Filter Aktif
                <span className="msd-badge">{filterGroups.reduce((n, g) => n + g.values.length, 0)}</span>
              </span>
              <button
                className="active-filters-toggle"
                onClick={() => setFiltersCollapsed(v => !v)}
                title={filtersCollapsed ? 'Perbesar' : 'Perkecil'}
              >
                {filtersCollapsed ? '⤢ Maximize' : '⤡ Minimize'}
              </button>
            </div>
            {!filtersCollapsed && filterGroups.map((group) => (
              <div key={group.type} className="filter-group-row">
                <div className="filter-group-name">{group.label}</div>
                <div className="filter-group-values">
                  {group.values.map((val) => (
                    <span key={String(val)} className="filter-chip">
                      {group.fmt(val)}
                      <button className="chip-remove" onClick={() => removeChip({ type: group.type, val })}>✕</button>
                    </span>
                  ))}
                </div>
                <button
                  className="filter-group-clear"
                  onClick={() => clearGroup(group.type)}
                  title={`Hapus semua ${group.label}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="search-row" style={{ marginTop: 14 }}>
          <div className="input-wrap" style={{ position: 'relative' }}>
            <span className="input-icon">🔍</span>
            <input
              ref={inputRef}
              className="search-input"
              type="text"
              placeholder="Cari nama layanan atau tindakan medis..."
              value={query}
              onChange={handleQueryChange}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              onFocus={() => suggestions.length > 0 && setShowSugg(true)}
              autoComplete="off"
            />
            {query && <button className="clear-btn" onClick={handleClear}>✕</button>}
            {showSugg && (
              <div className="suggestions" ref={suggRef}>
                {suggestions.map((s) => (
                  <div key={s.nama_layanan} className="suggestion-item" onMouseDown={() => handleSuggClick(s.nama_layanan)}>
                    <span className="suggestion-icon">↗</span>
                    <div>
                      <div className="suggestion-text">{highlight(s.nama_layanan, query)}</div>
                      <div className="suggestion-cat">{s.kategori_harga.replace('TARIF ', '')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            className="search-btn"
            onClick={() => handleSearch()}
            disabled={loading || (!query.trim() && !selectedKategori.length && !selectedRS.length && !selectedTahun.length && !selectedKelas.length)}
          >
            {loading ? "Mencari..." : "Cari"}
          </button>
        </div>
      </div>

      {error && (
        <div className="state-box" style={{ borderColor: 'rgba(192,57,43,0.3)', background: 'rgba(192,57,43,0.05)', marginBottom: 22 }}>
          <div className="state-icon">⚠️</div>
          <div className="state-title" style={{ color: '#e74c3c', fontFamily: 'var(--font-body)', fontSize: 16 }}>Terjadi Kesalahan</div>
          <div className="state-sub">{error}</div>
        </div>
      )}

      {!searched && !loading && (
        <div className="state-box">
          <div className="state-icon">🔎</div>
          <div className="state-title">Cari Layanan Medis</div>
          <div className="state-sub">Ketik nama tindakan atau layanan, atau pilih filter saja lalu tekan Cari.</div>
          <div className="state-hint">Tekan <kbd>/</kbd> untuk fokus ke kolom pencarian</div>
        </div>
      )}

      {searched && (
        <>
          {/* {results.length > 0 && (
            <div className="view-tabs">
              <button className={`view-tab ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>Daftar</button>
              <button className={`view-tab ${view === 'compare' ? 'active' : ''}`} onClick={() => setView('compare')}>Bandingkan</button>
            </div>
          )} */}

          {view === 'compare' && results.length > 0 ? (
            <CompareView apiParams={committedParams} axes={compareAxes} showRS={showRS} />
          ) : (
          <>
          {results.length > 0 && (
            <div className="results-meta">
              <div className="results-count">
                Menampilkan <span>{(page - 1) * 50 + 1}–{(page - 1) * 50 + results.length}</span> dari <span>{total}</span> hasil
                {query && <> untuk "<span>{query}</span>"</>}
              </div>
              <div className="results-tools">
                <div className="sort-group">
                  Urutkan harga:
                  <button
                    className={`sort-btn ${sortKeys.length === 1 && sortKeys[0].col === 'tarif' && sortKeys[0].dir === 'desc' ? 'active' : ''}`}
                    onClick={() => applySortKeys([{ col: 'tarif', dir: 'desc' }])}
                  >
                    Termahal ↓
                  </button>
                  <button
                    className={`sort-btn ${sortKeys.length === 1 && sortKeys[0].col === 'tarif' && sortKeys[0].dir === 'asc' ? 'active' : ''}`}
                    onClick={() => applySortKeys([{ col: 'tarif', dir: 'asc' }])}
                  >
                    Termurah ↑
                  </button>
                  <SortPanel fields={sortFields} sortKeys={sortKeys} onChange={applySortKeys} defaultSort={DEFAULT_SORT} />
                </div>
                <div className="export-group">
                  Ekspor:
                  <button className="export-btn" onClick={() => handleExport('csv')} disabled={!committedParams}>⬇ CSV</button>
                  <button className="export-btn" onClick={() => handleExport('xlsx')} disabled={!committedParams}>⬇ Excel</button>
                </div>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortableTh col="tahun" label="Tahun" sortKeys={sortKeys} onSort={handleHeaderSort} />
                  {showRS && <SortableTh col="nama_group" label="Grup RS" sortKeys={sortKeys} onSort={handleHeaderSort} />}
                  {showRS && <SortableTh col="rumah_sakit" label="Rumah Sakit" sortKeys={sortKeys} onSort={handleHeaderSort} />}
                  <SortableTh col="kategori_harga" label="Kategori" sortKeys={sortKeys} onSort={handleHeaderSort} />
                  <SortableTh col="nama_layanan" label="Nama Layanan" sortKeys={sortKeys} onSort={handleHeaderSort} />
                  <SortableTh col="kelas_kamar" label="Kelas Kamar" sortKeys={sortKeys} onSort={handleHeaderSort} />
                  <SortableTh col="tarif" label="Tarif" align="right" sortKeys={sortKeys} onSort={handleHeaderSort} />
                  <SortableTh col="pct_increase" label="% vs Last Year" align="right" sortKeys={sortKeys} onSort={handleHeaderSort}>
                    <InfoTip label="Informasi kolom kenaikan harga">
                      Perubahan harga dibandingkan tahun sebelumnya.
                      Tanda “—” berarti tidak ada data tahun lalu untuk item yang sama
                      dengan kelas kamar dan kategori harga yang sama.
                    </InfoTip>
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr className="loading-row">
                    <td colSpan={showRS ? 8 : 6}><div className="spinner" /></td>
                  </tr>
                )}
                {!loading && results.length === 0 && (
                  <tr>
                    <td colSpan={showRS ? 8 : 6} style={{ padding: '52px', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.5 }}>🔍</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
                        Tidak ada hasil
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Coba kata kunci lain atau ubah filter
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && results.map((r, i) => (
                  <tr key={`${r.nama_layanan}-${r.rumah_sakit}-${r.tahun}-${r.kelas_kamar}-${r.tarif}-${i}`}>
                    <td><span className="td-tahun">{r.tahun}</span></td>
                    {showRS && <td><span className="td-rs">{r.nama_group || '—'}</span></td>}
                    {showRS && <td><span className="td-rs">{r.rumah_sakit}</span></td>}
                    <td><span className="td-kategori">{highlight(r.kategori_harga.replace('TARIF ', ''), query)}</span></td>
                    <td><span className="td-layanan">{highlight(r.nama_layanan, query)}</span></td>
                    <td><span className="td-kelas">{r.kelas_kamar}</span></td>
                    <td style={{ textAlign: 'right' }}><span className="td-tarif">{formatRupiah(r.tarif)}</span></td>
                    <td style={{ textAlign: 'right' }}><span className="td-pct">{r.pct_increase != null ? `${r.pct_increase}%` : '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={goToPage} />
          {totalPages > 1 && !loading && (
            <div className="pagination-info">Halaman {page} dari {totalPages}</div>
          )}
          </>
          )}
        </>
      )}
    </main>
  );
}
