import { useState, useEffect, useCallback } from "react";
import { API, highlight } from "../lib/utils.jsx";
import { InfoTip } from "../components/InfoTip.jsx";
import { MultiSelectDropdown } from "../components/MultiSelectDropdown.jsx";
import { Pagination } from "../components/Pagination.jsx";
import { SortPanel } from "../components/SortPanel.jsx";
import { SortableTh } from "../components/SortableTh.jsx";

// ─── GolonganView ───────────────────────────────────────────────────
// Tab kedua: referensi golongan tindakan operasi (rumah sakit · spesialisasi ·
// golongan · nama layanan). Datanya ada di project Supabase tersendiri
// (sql/golongan/*), diambil lewat /api/golongan; pencarian, filter, urutan,
// dan paginasi dikerjakan database. Isi dropdown dari /api/golongan/filters
// (golongan sudah urut menurut tingkat: Kecil → Sedang → Besar → Khusus).

const GOL_SORT_FIELDS = [
  { col: 'rumah_sakit', label: 'Rumah Sakit' },
  { col: 'specialty', label: 'Spesialisasi' },
  { col: 'golongan', label: 'Golongan' },
  { col: 'nama_layanan', label: 'Nama Layanan' },
];
const GOL_DEFAULT_SORT = [
  { col: 'rumah_sakit', dir: 'asc' },
  { col: 'specialty', dir: 'asc' },
  { col: 'golongan', dir: 'asc' },
];
const GOL_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

export default function GolonganView() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selRS, setSelRS] = useState([]);
  const [selSpec, setSelSpec] = useState([]);
  const [selGol, setSelGol] = useState([]);
  const [sortKeys, setSortKeys] = useState(GOL_DEFAULT_SORT);
  const [page, setPage] = useState(1);

  const [filters, setFilters] = useState({ rumah_sakit: [], specialty: [], golongan: [] });
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState(false);

  // Hasil terakhir beserta kunci permintaannya; selama kunci berbeda dengan
  // kriteria sekarang, berarti data baru sedang dimuat.
  const [resp, setResp] = useState({ key: null, data: [], total: 0, totalPages: 0, error: null });

  // Setiap perubahan kriteria mengembalikan ke halaman 1.
  const withPageReset = (setter) => (value) => { setter(value); setPage(1); };
  const changeRS = withPageReset(setSelRS);
  const changeSpec = withPageReset(setSelSpec);
  const changeGol = withPageReset(setSelGol);
  const changeSort = withPageReset(setSortKeys);

  const fetchFilters = useCallback(() => {
    fetch(`${API}/golongan/filters`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setFilters)
      .catch(err => { console.error(err); setFiltersError(true); })
      .finally(() => setFiltersLoading(false));
  }, []);

  const retryFilters = () => {
    setFiltersLoading(true);
    setFiltersError(false);
    fetchFilters();
  };

  useEffect(() => { fetchFilters(); }, [fetchFilters]);

  // Ketikan baru dikirim setelah jeda singkat, bukan per huruf.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(prev => {
        const next = query.trim();
        if (next !== prev) setPage(1);
        return next;
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const params = new URLSearchParams();
  if (debouncedQuery) params.set('q', debouncedQuery);
  selRS.forEach(v => params.append('rumah_sakit', v));
  selSpec.forEach(v => params.append('specialty', v));
  selGol.forEach(v => params.append('golongan', v));
  params.set('sort', sortKeys.map(k => `${k.col}:${k.dir}`).join(','));
  params.set('page', page);
  const requestKey = params.toString();

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${API}/golongan?${requestKey}`, { signal: ctrl.signal })
      .then(r => r.json().then(body => {
        if (!r.ok || body.error) throw new Error(body.error || `HTTP ${r.status}`);
        return body;
      }))
      .then(body => setResp({ key: requestKey, ...body, error: null }))
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.error(err);
        setResp({
          key: requestKey, data: [], total: 0, totalPages: 0,
          error: 'Gagal memuat data golongan. Periksa koneksi dan coba lagi.',
        });
      });
    return () => ctrl.abort();
  }, [requestKey]);

  const loading = resp.key !== requestKey;
  const error = loading ? null : resp.error;
  const pageRows = loading ? [] : resp.data;
  const total = resp.total;
  const totalPages = resp.totalPages;
  const curPage = page;

  // Klik header: jadikan kolom ini kunci tunggal (toggle arah bila sudah tunggal).
  // Shift+klik: tambah sebagai tingkat urutan berikutnya.
  const handleSort = (col, additive) => {
    const idx = sortKeys.findIndex(k => k.col === col);
    if (additive) {
      if (idx === -1) return changeSort([...sortKeys, { col, dir: 'asc' }]);
      return changeSort(sortKeys.map((k, i) => i === idx ? { ...k, dir: k.dir === 'asc' ? 'desc' : 'asc' } : k));
    }
    const dir = sortKeys.length === 1 && idx === 0 && sortKeys[0].dir === 'asc' ? 'desc' : 'asc';
    changeSort([{ col, dir }]);
  };

  const handleClear = () => {
    setQuery(""); setSelRS([]); setSelSpec([]); setSelGol([]); setPage(1);
    setSortKeys(GOL_DEFAULT_SORT);
  };

  const activeGroups = [
    { type: 'rs', label: 'Rumah Sakit', values: selRS, set: changeRS },
    { type: 'spec', label: 'Spesialisasi', values: selSpec, set: changeSpec },
    { type: 'gol', label: 'Golongan', values: selGol, set: changeGol },
  ].filter(g => g.values.length > 0);

  return (
    <main className="main">
      <div className="search-card">
        <div className="search-label">Filter</div>
        <div className="filter-zone" aria-busy={filtersLoading}>
        <div className="filter-row">
          <MultiSelectDropdown
            label="Rumah Sakit"
            options={filters.rumah_sakit}
            selected={selRS}
            onChange={changeRS}
          />
          <MultiSelectDropdown
            label="Spesialisasi"
            options={filters.specialty}
            selected={selSpec}
            onChange={changeSpec}
          />
          <MultiSelectDropdown
            label="Golongan"
            options={filters.golongan}
            selected={selGol}
            onChange={changeGol}
          />
        </div>

          {filtersLoading && (
            <div className="filter-overlay" role="status">
              <span className="spinner" />
              <span>Memuat data filter...</span>
            </div>
          )}

          {!filtersLoading && filtersError && (
            <div className="filter-overlay filter-overlay-error" role="alert">
              <span>⚠️ Gagal memuat data filter.</span>
              <button className="filter-retry-btn" onClick={retryFilters}>Coba lagi</button>
            </div>
          )}
        </div>

        {activeGroups.length > 0 && (
          <div className="active-filters">
            <div className="active-filters-header">
              <span className="active-filters-title">
                Filter Aktif
                <span className="msd-badge">{activeGroups.reduce((n, g) => n + g.values.length, 0)}</span>
              </span>
            </div>
            {activeGroups.map((group) => (
              <div key={group.type} className="filter-group-row">
                <div className="filter-group-name">{group.label}</div>
                <div className="filter-group-values">
                  {group.values.map((val) => (
                    <span key={val} className="filter-chip">
                      {val}
                      <button className="chip-remove" onClick={() => group.set(v => v.filter(x => x !== val))}>✕</button>
                    </span>
                  ))}
                </div>
                <button
                  className="filter-group-clear"
                  onClick={() => group.set([])}
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
              className="search-input"
              type="text"
              placeholder="Cari nama tindakan operasi atau spesialisasi..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            {query && <button className="clear-btn" onClick={handleClear}>✕</button>}
          </div>
        </div>
      </div>

      <div className="results-meta">
        <div className="results-count">
          {loading ? (
            <>Memuat...</>
          ) : total > 0 ? (
            <>
              Menampilkan <span>{(curPage - 1) * GOL_PAGE_SIZE + 1}–{(curPage - 1) * GOL_PAGE_SIZE + pageRows.length}</span> dari <span>{total}</span> tindakan
              {debouncedQuery && <> untuk "<span>{debouncedQuery}</span>"</>}
            </>
          ) : (
            <>Tidak ada tindakan yang cocok</>
          )}
        </div>
        <div className="results-tools">
          <div className="sort-group">
            Urutkan:
            <SortPanel
              fields={GOL_SORT_FIELDS}
              sortKeys={sortKeys}
              onChange={(keys) => changeSort(keys.length ? keys : GOL_DEFAULT_SORT)}
              defaultSort={GOL_DEFAULT_SORT}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="state-box" style={{ borderColor: 'rgba(192,57,43,0.3)', background: 'rgba(192,57,43,0.05)', marginBottom: 22 }}>
          <div className="state-icon">⚠️</div>
          <div className="state-title" style={{ color: '#e74c3c', fontFamily: 'var(--font-body)', fontSize: 16 }}>Terjadi Kesalahan</div>
          <div className="state-sub">{error}</div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortableTh col="rumah_sakit" label="Rumah Sakit" sortKeys={sortKeys} onSort={handleSort} />
              <SortableTh col="specialty" label="Spesialisasi" sortKeys={sortKeys} onSort={handleSort} />
              <SortableTh col="golongan" label="Golongan" sortKeys={sortKeys} onSort={handleSort}>
                <InfoTip label="Informasi kolom golongan">
                  Tingkat golongan tindakan operasi, dari Kecil → Sedang → Besar → Khusus.
                  Urutan kolom ini mengikuti tingkatannya, bukan abjad.
                </InfoTip>
              </SortableTh>
              <SortableTh col="nama_layanan" label="Nama Layanan" sortKeys={sortKeys} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="loading-row">
                <td colSpan={4}><div className="spinner" /></td>
              </tr>
            )}
            {!loading && !error && pageRows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '52px', textAlign: 'center' }}>
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
            {!loading && pageRows.map((r, i) => (
              <tr key={`${r.rumah_sakit}-${r.specialty}-${r.golongan}-${r.service_code}-${r.nama_layanan}-${i}`}>
                <td><span className="td-rs">{r.rumah_sakit}</span></td>
                <td><span className="td-spec">{highlight(r.specialty, debouncedQuery)}</span></td>
                <td><span className="td-golongan">{r.golongan}</span></td>
                <td><span className="td-layanan">{highlight(r.nama_layanan, debouncedQuery)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={curPage} totalPages={totalPages} onPage={setPage} />
      {totalPages > 1 && !loading && (
        <div className="pagination-info">Halaman {curPage} dari {totalPages}</div>
      )}
    </main>
  );
}
