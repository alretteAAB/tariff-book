import { useState, useEffect, useMemo } from "react";
import golonganData from "../data/golongan-operasi.json";
import { highlight } from "../lib/utils.jsx";
import { InfoTip } from "../components/InfoTip.jsx";
import { MultiSelectDropdown } from "../components/MultiSelectDropdown.jsx";
import { Pagination } from "../components/Pagination.jsx";
import { SortPanel } from "../components/SortPanel.jsx";
import { SortableTh } from "../components/SortableTh.jsx";

// ─── GolonganView ───────────────────────────────────────────────────
// Tab kedua: referensi golongan tindakan operasi (rumah sakit · spesialisasi ·
// golongan · nama layanan). Datanya statis dan ikut di-bundle
// (src/data/golongan-operasi.json, gabungan dari berkas-berkas di data/), jadi
// semua pencarian, filter, pengurutan, dan paginasi dilakukan di sisi klien —
// tanpa panggilan API.
//
// Catatan data: buku Grand Wisata menulis golongan dengan awalan "OPERASI "
// ("OPERASI KECIL"), Bekasi Timur tanpa awalan. Awalan itu dibuang saat data
// dibuat agar keduanya jadi satu nilai di filter dan pengurutan.

// Urutan golongan mengikuti tingkatannya, bukan abjad. 'SEDANG' tanpa angka
// hanya dipakai Grand Wisata, ditaruh sebelum tingkat SEDANG yang bernomor.
const GOL_ORDER = [
  'KECIL', 'SEDANG', 'SEDANG 1', 'SEDANG 2', 'SEDANG 3',
  'BESAR 1', 'BESAR 2', 'BESAR 3',
  'KHUSUS 1', 'KHUSUS 2', 'KHUSUS 3',
];
const golRank = (g) => {
  const i = GOL_ORDER.indexOf(g);
  return i === -1 ? GOL_ORDER.length : i;
};

const GOL_RUMAH_SAKIT = [...new Set(golonganData.map(r => r.rumah_sakit))].sort((a, b) => a.localeCompare(b, 'id'));
const GOL_SPECIALTIES = [...new Set(golonganData.map(r => r.specialty))].sort((a, b) => a.localeCompare(b, 'id'));
const GOL_GOLONGAN = [...new Set(golonganData.map(r => r.golongan))].sort((a, b) => golRank(a) - golRank(b));

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

export default function GolonganView() {
  const [query, setQuery] = useState("");
  const [selRS, setSelRS] = useState([]);
  const [selSpec, setSelSpec] = useState([]);
  const [selGol, setSelGol] = useState([]);
  const [sortKeys, setSortKeys] = useState(GOL_DEFAULT_SORT);
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = golonganData.filter(r =>
      (!q || r.nama_layanan.toLowerCase().includes(q) || r.specialty.toLowerCase().includes(q)) &&
      (!selRS.length || selRS.includes(r.rumah_sakit)) &&
      (!selSpec.length || selSpec.includes(r.specialty)) &&
      (!selGol.length || selGol.includes(r.golongan))
    );
    // Golongan diurutkan berdasarkan tingkat (GOL_ORDER), kolom lain secara abjad.
    return filtered.sort((a, b) => {
      for (const k of sortKeys) {
        const d = k.col === 'golongan'
          ? golRank(a.golongan) - golRank(b.golongan)
          : a[k.col].localeCompare(b[k.col], 'id');
        if (d) return k.dir === 'asc' ? d : -d;
      }
      return a.nama_layanan.localeCompare(b.nama_layanan, 'id');
    });
  }, [query, selRS, selSpec, selGol, sortKeys]);

  const totalPages = Math.ceil(rows.length / GOL_PAGE_SIZE);
  // Dijepit saat render agar halaman tidak sempat "kosong" satu frame ketika
  // hasil menyusut; efek di bawah yang mengembalikan state-nya ke 1.
  const curPage = Math.min(page, Math.max(totalPages, 1));
  const pageRows = rows.slice((curPage - 1) * GOL_PAGE_SIZE, curPage * GOL_PAGE_SIZE);

  // Kembali ke halaman 1 setiap kali hasil berubah
  useEffect(() => { setPage(1); }, [query, selRS, selSpec, selGol, sortKeys]);

  // Klik header: jadikan kolom ini kunci tunggal (toggle arah bila sudah tunggal).
  // Shift+klik: tambah sebagai tingkat urutan berikutnya.
  const handleSort = (col, additive) => {
    const idx = sortKeys.findIndex(k => k.col === col);
    if (additive) {
      if (idx === -1) return setSortKeys([...sortKeys, { col, dir: 'asc' }]);
      return setSortKeys(sortKeys.map((k, i) => i === idx ? { ...k, dir: k.dir === 'asc' ? 'desc' : 'asc' } : k));
    }
    const dir = sortKeys.length === 1 && idx === 0 && sortKeys[0].dir === 'asc' ? 'desc' : 'asc';
    setSortKeys([{ col, dir }]);
  };

  const handleClear = () => {
    setQuery(""); setSelRS([]); setSelSpec([]); setSelGol([]);
    setSortKeys(GOL_DEFAULT_SORT);
  };

  const activeGroups = [
    { type: 'rs', label: 'Rumah Sakit', values: selRS, set: setSelRS },
    { type: 'spec', label: 'Spesialisasi', values: selSpec, set: setSelSpec },
    { type: 'gol', label: 'Golongan', values: selGol, set: setSelGol },
  ].filter(g => g.values.length > 0);

  return (
    <main className="main">
      <div className="search-card">
        <div className="search-label">Filter</div>
        <div className="filter-row">
          <MultiSelectDropdown
            label="Rumah Sakit"
            options={GOL_RUMAH_SAKIT}
            selected={selRS}
            onChange={setSelRS}
          />
          <MultiSelectDropdown
            label="Spesialisasi"
            options={GOL_SPECIALTIES}
            selected={selSpec}
            onChange={setSelSpec}
          />
          <MultiSelectDropdown
            label="Golongan"
            options={GOL_GOLONGAN}
            selected={selGol}
            onChange={setSelGol}
          />
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
          {rows.length > 0 ? (
            <>
              Menampilkan <span>{(curPage - 1) * GOL_PAGE_SIZE + 1}–{(curPage - 1) * GOL_PAGE_SIZE + pageRows.length}</span> dari <span>{rows.length}</span> tindakan
              {query && <> untuk "<span>{query}</span>"</>}
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
              onChange={(keys) => setSortKeys(keys.length ? keys : GOL_DEFAULT_SORT)}
              defaultSort={GOL_DEFAULT_SORT}
            />
          </div>
        </div>
      </div>

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
            {pageRows.length === 0 && (
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
            {pageRows.map((r) => (
              <tr key={`${r.rumah_sakit}-${r.specialty}-${r.golongan}-${r.nama_layanan}`}>
                <td><span className="td-rs">{r.rumah_sakit}</span></td>
                <td><span className="td-spec">{highlight(r.specialty, query)}</span></td>
                <td><span className="td-golongan">{r.golongan}</span></td>
                <td><span className="td-layanan">{highlight(r.nama_layanan, query)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={curPage} totalPages={totalPages} onPage={setPage} />
      {totalPages > 1 && (
        <div className="pagination-info">Halaman {curPage} dari {totalPages}</div>
      )}
    </main>
  );
}
