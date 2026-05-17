import { useState, useEffect, useRef, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --cream: #faf7f2;
    --cream-dark: #f2ece0;
    --cream-border: #e8dcc8;
    --gold: #c9972c;
    --gold-light: #f0c85a;
    --gold-dark: #a07820;
    --brown: #6b4c2a;
    --brown-light: #9b7a52;
    --text: #2c1f0e;
    --text-muted: #8a7260;
    --white: #ffffff;
    --shadow: 0 4px 24px rgba(107,76,42,0.10);
    --shadow-lg: 0 8px 40px rgba(107,76,42,0.15);
    --radius: 14px;
    --radius-sm: 8px;
  }

  body {
    background: var(--cream);
    font-family: 'DM Sans', sans-serif;
    color: var(--text);
    min-height: 100vh;
  }

  .app {
    min-height: 100vh;
    background:
      radial-gradient(ellipse at 10% 0%, rgba(201,151,44,0.10) 0%, transparent 60%),
      radial-gradient(ellipse at 90% 100%, rgba(201,151,44,0.08) 0%, transparent 60%),
      var(--cream);
    width: 100%;
  }

  /* HEADER */
  .header {
    background: var(--white);
    border-bottom: 1px solid var(--cream-border);
    padding: 28px 40px;
    display: flex;
    align-items: left;
    gap: 16px;
    box-shadow: 0 2px 12px rgba(107,76,42,0.06);
  }
  .header-icon {
    width: 48px; height: 48px;
    background: linear-gradient(135deg, var(--gold), var(--gold-dark));
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
    box-shadow: 0 4px 12px rgba(201,151,44,0.30);
    flex-shrink: 0;
  }
  .header-title {
    font-size: 22px; font-weight: 700;
    color: var(--brown); letter-spacing: -0.3px;
    text-align : left;
  }
  .header-sub {
    font-size: 13px; color: var(--text-muted);
    margin-top: 2px; font-weight: 400;
    text-align = left;
  }

  /* MAIN */
  .app {
  width: 100%;
  max-width: 100%;
}

.main {
  max-width: 100%;
  padding: 40px 40px 80px;  /* samakan padding kiri-kanan dengan header */
}

  /* SEARCH CARD */
  .search-card {
    background: var(--white);
    border-radius: var(--radius);
    border: 1px solid var(--cream-border);
    padding: 28px;
    box-shadow: var(--shadow);
    margin-bottom: 28px;
  }
  .search-label {
    font-size: 12px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1px;
    color: var(--gold-dark); margin-bottom: 16px;
    text-align: left;
  }
  .search-row {
    display: flex; 
    gap: 12px;
    align-items: stretch; /* Biar tinggi input & tombol sama */
    flex-wrap: nowrap; /* Jangan turun ke bawah kalau di desktop */
  }
  
  .input-wrap {
    flex: 1; /* Input ambil semua sisa ruang */
  }

  .search-btn {
    padding: 0 40px; /* Lebarin tombol dikit biar makin tegas */
    height: 48px; /* Samakan dengan tinggi input */
  }

  /* INPUT WRAP */
  .input-wrap {
    position: relative; flex: 1; min-width: 200px;
  }
  .search-input {
    width: 100%;
    padding: 12px 36px 12px 42px;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px; color: var(--text);
    background: var(--cream);
    border: 1.5px solid var(--cream-border);
    border-radius: var(--radius-sm);
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .search-input:focus {
    border-color: var(--gold);
    box-shadow: 0 0 0 3px rgba(201,151,44,0.12);
    background: var(--white);
  }
  .search-input::placeholder { color: var(--text-muted); }
  .input-icon {
    position: absolute; left: 14px; top: 50%;
    transform: translateY(-50%);
    color: var(--brown-light); font-size: 15px;
    pointer-events: none;
  }
  .clear-btn {
    position: absolute; right: 10px; top: 50%;
    transform: translateY(-50%);
    background: none; border: none;
    color: var(--text-muted); cursor: pointer;
    font-size: 14px; padding: 2px; line-height: 1;
    transition: color 0.2s;
  }
  .clear-btn:hover { color: var(--brown); }

  /* SUGGESTIONS */
  .suggestions {
    position: absolute;
    top: calc(100% + 6px); left: 0; right: 0;
    background: var(--white);
    border: 1.5px solid var(--cream-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lg);
    z-index: 200; overflow: hidden;
    animation: fadeDown 0.15s ease;
  }
  @keyframes fadeDown {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .suggestion-item {
    padding: 10px 14px; font-size: 14px; cursor: pointer;
    display: flex; align-items: center; gap: 10px;
    transition: background 0.15s;
    border-bottom: 1px solid var(--cream-border);
    text-align: left;
  }
  .suggestion-item:last-child { border-bottom: none; }
  .suggestion-item:hover { background: var(--cream); }
  .suggestion-icon { color: var(--gold); font-size: 12px; flex-shrink: 0; }
  .suggestion-text mark {
    background: rgba(201,151,44,0.18);
    color: var(--gold-dark); border-radius: 3px;
    padding: 0 2px; font-weight: 700;
  }
  .suggestion-cat {
    font-size: 11px; color: var(--text-muted); margin-top: 1px;
  }

  /* SEARCH BTN */
  .search-btn {
    padding: 12px 28px;
    background: linear-gradient(135deg, var(--gold), var(--gold-dark));
    color: var(--white); border: none;
    border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif;
    font-size: 15px; font-weight: 600; cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 4px 14px rgba(201,151,44,0.35);
    white-space: nowrap; letter-spacing: 0.2px;
    align-self: flex-start;
  }
  .search-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(201,151,44,0.45); }
  .search-btn:active { transform: translateY(0); }
  .search-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

  /* FILTER ROW */
  .filter-row {
    display: flex; gap: 10px; flex-wrap: wrap;
    margin-top: 12px;
  }

  /* MULTI SELECT DROPDOWN */
  .msd-wrap { position: relative; }
  .msd-trigger {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px;
    background: var(--cream);
    border: 1.5px solid var(--cream-border);
    border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif;
    font-size: 13px; font-weight: 500;
    color: var(--text); cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
    white-space: nowrap; user-select: none;
    min-width: 140px;
  }
  .msd-trigger:hover { border-color: var(--gold); }
  .msd-trigger.open {
    border-color: var(--gold);
    box-shadow: 0 0 0 3px rgba(201,151,44,0.12);
    background: var(--white);
  }
  .msd-trigger.has-selection {
    border-color: var(--gold);
    background: rgba(201,151,44,0.08);
    color: var(--gold-dark);
  }
  .msd-label { flex: 1; text-align: left; }
  .msd-badge {
    background: var(--gold);
    color: var(--white);
    border-radius: 10px;
    font-size: 11px; font-weight: 700;
    padding: 1px 6px; line-height: 1.5;
  }
  .msd-arrow { font-size: 10px; color: var(--brown-light); transition: transform 0.2s; }
  .msd-trigger.open .msd-arrow { transform: rotate(180deg); }

  .msd-menu {
    position: absolute; top: calc(100% + 6px); left: 0;
    min-width: 260px; max-width: 340px;
    background: var(--white);
    border: 1.5px solid var(--cream-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lg);
    z-index: 150; overflow: hidden;
    animation: fadeDown 0.15s ease;
  }

  .msd-search-wrap {
    padding: 10px 12px;
    border-bottom: 1px solid var(--cream-border);
  }
  .msd-search {
    width: 100%; padding: 7px 10px;
    font-family: 'DM Sans', sans-serif; font-size: 13px;
    color: var(--text); background: var(--cream);
    border: 1.5px solid var(--cream-border);
    border-radius: 6px; outline: none;
    transition: border-color 0.2s;
  }
  .msd-search:focus { border-color: var(--gold); }

  .msd-actions {
    display: flex; gap: 0;
    border-bottom: 1px solid var(--cream-border);
  }
  .msd-action-btn {
    flex: 1; padding: 7px;
    background: none; border: none;
    font-family: 'DM Sans', sans-serif;
    font-size: 12px; font-weight: 600;
    color: var(--gold-dark); cursor: pointer;
    transition: background 0.15s;
  }
  .msd-action-btn:hover { background: var(--cream); }
  .msd-action-btn:first-child { border-right: 1px solid var(--cream-border); }

  .msd-list {
    max-height: 220px; overflow-y: auto;
    padding: 6px 0;
  }
  .msd-list::-webkit-scrollbar { width: 4px; }
  .msd-list::-webkit-scrollbar-track { background: transparent; }
  .msd-list::-webkit-scrollbar-thumb { background: var(--cream-border); border-radius: 2px; }

  .msd-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px; cursor: pointer;
    transition: background 0.12s; font-size: 13px;
    color: var(--text); text-align: left;
  }
  .msd-item:hover { background: var(--cream); }
  .msd-item.checked { color: var(--gold-dark); }

  .msd-checkbox {
    width: 16px; height: 16px; flex-shrink: 0;
    border: 1.5px solid var(--cream-border);
    border-radius: 4px; display: flex;
    align-items: center; justify-content: center;
    transition: all 0.15s; background: var(--white);
  }
  .msd-item.checked .msd-checkbox {
    background: var(--gold); border-color: var(--gold);
  }
  .msd-checkmark {
    color: white; font-size: 10px; font-weight: 700;
    display: none;
  }
  .msd-item.checked .msd-checkmark { display: block; }
  .msd-item-text { flex: 1; line-height: 1.3; }

  .msd-empty {
    padding: 16px; text-align: center;
    font-size: 13px; color: var(--text-muted);
  }

  /* ACTIVE FILTERS CHIPS */
  .active-filters {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-top: 12px;
  }
  .filter-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px;
    background: rgba(201,151,44,0.12);
    border: 1px solid rgba(201,151,44,0.3);
    border-radius: 20px;
    font-size: 12px; font-weight: 500;
    color: var(--gold-dark);
  }
  .chip-remove {
    background: none; border: none;
    color: var(--gold-dark); cursor: pointer;
    font-size: 12px; padding: 0; line-height: 1;
    opacity: 0.7; transition: opacity 0.15s;
  }
  .chip-remove:hover { opacity: 1; }

  /* RESULTS META */
  .results-meta {
    display: flex; align-items: center;
    justify-content: space-between;
    margin-bottom: 16px; flex-wrap: wrap; gap: 8px;
  }
  .results-count {
    font-size: 13px; color: var(--text-muted); font-weight: 500;
  }
  .results-count span { color: var(--gold-dark); font-weight: 700; }

  /* SORT */
  .sort-group {
    display: flex; align-items: center;
    gap: 6px; font-size: 13px; color: var(--text-muted);
  }
  .sort-btn {
    padding: 5px 12px; border-radius: 20px;
    border: 1.5px solid var(--cream-border);
    background: var(--white);
    font-family: 'DM Sans', sans-serif;
    font-size: 12px; font-weight: 500;
    cursor: pointer; transition: all 0.15s; color: var(--text-muted);
  }
  .sort-btn.active {
    background: var(--gold); border-color: var(--gold);
    color: var(--white); font-weight: 600;
  }
  .sort-btn:not(.active):hover { border-color: var(--gold); color: var(--gold-dark); }

  /* TABLE */
  .table-wrap {
    background: var(--white);
    border-radius: var(--radius);
    border: 1px solid var(--cream-border);
    overflow-x: auto;
    box-shadow: var(--shadow);
  }
  table { min-width: 600px; width: 100%; border-collapse: collapse; font-size: 14px; }
  
  thead tr {
    background: linear-gradient(135deg, #f5ede0, #ede0cc);
    border-bottom: 2px solid var(--cream-border);
  }
  th {
    padding: 14px 18px; text-align: left;
    font-family: 'DM Sans', sans-serif;
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--brown-light); white-space: nowrap;
  }
  th.right { text-align: right; }
  tbody tr {
    border-bottom: 1px solid var(--cream-border);
    transition: background 0.15s;
  }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover { background: #fdf8f1; }
  td {
    padding: 13px 18px; vertical-align: middle;
    color: var(--text); line-height: 1.4;
    text-align: left;
  }
  .td-kategori {
    font-size: 11px; font-weight: 600;
    color: var(--brown-light); text-transform: uppercase;
    letter-spacing: 0.4px; text-align: left;
  }
  .td-layanan { font-weight: 500; color: var(--text); text-align: left; }
  .td-layanan mark {
    background: rgba(201,151,44,0.18); color: var(--gold-dark);
    border-radius: 3px; padding: 0 2px; font-weight: 700;
  }
  .td-kelas {
    display: inline-block; padding: 3px 10px;
    background: var(--cream-dark); border-radius: 20px;
    font-size: 12px; font-weight: 500; color: var(--brown-light);
    white-space: nowrap;
  }
  .td-rs { font-size: 12px; color: var(--text-muted); text-align: left; }
  .td-tahun {
    font-size: 12px; font-weight: 600;
    color: var(--brown-light); text-align: left;
  }
  .td-tarif {
    text-align: right;
    font-size: 15px; font-weight: 600;
    color: var(--gold-dark); white-space: nowrap;
  }

  /* STATES */
  .state-box {
    background: var(--white); border-radius: var(--radius);
    border: 1px solid var(--cream-border);
    padding: 60px 24px; text-align: center;
    box-shadow: var(--shadow);
  }
  .state-icon { font-size: 44px; margin-bottom: 16px; }
  .state-title {
    font-size: 20px; font-weight: 600;
    color: var(--brown); margin-bottom: 8px;
  }
  .state-sub {
    font-size: 14px; color: var(--text-muted);
    max-width: 320px; margin: 0 auto; line-height: 1.6;
  }
  
  .scroll-btns {
    position: fixed;
    bottom: 30px;
    right: 30px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 999;
  }
  .scroll-btn {
    width: 44px; height: 44px;
    background: var(--gold);
    color: var(--white);
    border: none; border-radius: 50%;
    font-size: 20px; font-weight: bold;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(201,151,44,0.4);
    transition: transform 0.2s, background 0.2s;
    display: flex; align-items: center; justify-content: center;
  }
  .scroll-btn:hover {
    background: var(--gold-dark);
    transform: scale(1.1);
  }

  /* LOADING */
  .loading-row td { padding: 40px; text-align: center; }
  .spinner {
    display: inline-block; width: 24px; height: 24px;
    border: 3px solid var(--cream-border);
    border-top-color: var(--gold); border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* RESPONSIVE */
  @media (max-width: 680px) {
    .header { padding: 20px; }
    .main { padding: 24px 16px 60px; }
    .search-row {
      flex-direction: column; /* Tumpuk ke bawah kalau di HP */
    }
    .search-card { padding: 20px; }
    .search-btn { width: 100%; }
    th, td { padding: 10px 12px; }
    .td-rs, .td-tahun { display: none; }
  }
`;

function highlight(text, query) {
  if (!query) return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${esc})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase() ? <mark key={i}>{p}</mark> : p
  );
}

function formatRupiah(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0
  }).format(num);
}

// ─── MultiSelectDropdown ────────────────────────────────────────────
function MultiSelectDropdown({ label, options, selected, onChange, formatLabel }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fmt = formatLabel || (v => String(v));
  const filtered = options.filter(o =>
    fmt(o).toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (val) => {
    onChange(selected.includes(val)
      ? selected.filter(v => v !== val)
      : [...selected, val]
    );
  };

  const triggerLabel = selected.length === 0 || selected.length === options.length
    ? `Semua ${label}`
    : selected.length === 1
    ? fmt(selected[0]).replace('TARIF ', '')
    : `${label}`;

  return (
    <div className="msd-wrap" ref={ref}>
      <div
        className={`msd-trigger ${open ? 'open' : ''} ${selected.length > 0 && selected.length < options.length ? 'has-selection' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <span className="msd-label">{triggerLabel}</span>
        {selected.length > 0 && selected.length < options.length && (
          <span className="msd-badge">{selected.length}</span>
        )}
        <span className="msd-arrow">▾</span>
      </div>

      {open && (
        <div className="msd-menu">
          {options.length > 6 && (
            <div className="msd-search-wrap">
              <input
                className="msd-search"
                placeholder={`Cari ${label.toLowerCase()}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                autoFocus
              />
            </div>
          )}
          <div className="msd-actions">
            <button className="msd-action-btn" onMouseDown={e => { e.preventDefault(); onChange([...options]); }}>
              Pilih Semua
            </button>
            <button className="msd-action-btn" onMouseDown={e => { e.preventDefault(); onChange([]); }}>
              Hapus Semua
            </button>
          </div>
          <div className="msd-list">
            {filtered.length === 0 && <div className="msd-empty">Tidak ditemukan</div>}
            {filtered.map(opt => {
              const isChecked = selected.includes(opt);
              return (
                <div
                  key={String(opt)}
                  className={`msd-item ${isChecked ? 'checked' : ''}`}
                  onMouseDown={e => { e.preventDefault(); toggle(opt); }}
                >
                  <div className="msd-checkbox">
                    <span className="msd-checkmark">✓</span>
                  </div>
                  <span className="msd-item-text">{fmt(opt).replace('TARIF ', '')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────
export default function App() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ kategori: [], rumah_sakit: [], tahun: [] });
  const [selectedKategori, setSelectedKategori] = useState([]);
  const [selectedRS, setSelectedRS] = useState([]);
  const [selectedTahun, setSelectedTahun] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sort, setSort] = useState("desc");
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const suggDebounce = useRef(null);
  const inputRef = useRef(null);
  const suggRef = useRef(null);
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const scrollToBottom = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

  useEffect(() => {
    fetch(`${API}/filters`)
      .then(r => r.json())
      .then(setFilters)
      .catch(console.error);
  }, []);

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

  function buildParams(q, kat, rs, thn) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    kat.forEach(k => params.append('kategori', k));
    rs.forEach(r => params.append('rumah_sakit', r));
    thn.forEach(t => params.append('tahun', t));
    return params.toString();
  }

  const fetchSuggestions = useCallback((q) => {
    clearTimeout(suggDebounce.current);
    if (!q.trim()) { setSuggestions([]); setShowSugg(false); return; }
    suggDebounce.current = setTimeout(async () => {
      try {
        const p = buildParams(q, selectedKategori, selectedRS, selectedTahun);
        const res = await fetch(`${API}/suggest?${p}`);
        const data = await res.json();
        setSuggestions(data);
        setShowSugg(data.length > 0);
      } catch { setSuggestions([]); }
    }, 250);
  }, [selectedKategori, selectedRS, selectedTahun]);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    fetchSuggestions(val);
  };

  const handleSearch = async (overrideQ) => {
    const q = overrideQ ?? query;
    if (!q.trim()) return;
    setShowSugg(false);
    setLoading(true);
    setSearched(true);
    try {
      const p = buildParams(q, selectedKategori, selectedRS, selectedTahun);
      const res = await fetch(`${API}/search?${p}`);
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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
    setShowSugg(false);
    inputRef.current?.focus();
  };

  const sortedResults = [...results].sort((a, b) => {
    const nc = a.nama_layanan.localeCompare(b.nama_layanan);
    if (nc !== 0) return nc;
    return sort === 'desc' ? b.tarif - a.tarif : a.tarif - b.tarif;
  });

  const activeChips = [
    ...selectedKategori.map(k => ({ type: 'kategori', val: k, label: k.replace('TARIF ', '') })),
    ...selectedRS.map(r => ({ type: 'rs', val: r, label: r })),
    ...selectedTahun.map(t => ({ type: 'tahun', val: t, label: `Tahun ${t}` })),
  ];

  const removeChip = (chip) => {
    if (chip.type === 'kategori') setSelectedKategori(v => v.filter(x => x !== chip.val));
    if (chip.type === 'rs') setSelectedRS(v => v.filter(x => x !== chip.val));
    if (chip.type === 'tahun') setSelectedTahun(v => v.filter(x => x !== chip.val));
  };

  const showRS = filters.rumah_sakit?.length > 0;

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <header className="header">
          <div className="header-icon">📒</div>
          <div>
            <div className="header-title">Buku Tarif</div>
            <div className="header-sub">Pencarian tarif layanan & tindakan medis rumah sakit</div>
            <div className="header-sub">by : ASO</div>
          </div>
        </header>

        <main className="main">
          <div className="search-card">
            <div className="search-label">Pencarian Tarif</div>
            <div className="search-row">
              <div className="input-wrap" style={{ position: 'relative' }}>
                <span className="input-icon">🔍</span>
                <input
                  ref={inputRef}
                  className="search-input"
                  type="text"
                  placeholder="Cari nama layanan... (contoh: CT Scan, ICU, MRI)"
                  value={query}
                  onChange={handleQueryChange}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  onFocus={() => suggestions.length > 0 && setShowSugg(true)}
                  autoComplete="off"
                />
                {query && <button className="clear-btn" onClick={handleClear}>✕</button>}
                {showSugg && (
                  <div className="suggestions" ref={suggRef}>
                    {suggestions.map((s, i) => (
                      <div key={i} className="suggestion-item" onMouseDown={() => handleSuggClick(s.nama_layanan)}>
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
                disabled={loading || !query.trim()}
              >
                {loading ? "Mencari..." : "Cari"}
              </button>
            </div>

            <div className="filter-row">
              <MultiSelectDropdown
                label="Kategori"
                options={filters.kategori || []}
                selected={selectedKategori}
                onChange={setSelectedKategori}
              />
              {showRS && (
                <MultiSelectDropdown
                  label="Rumah Sakit"
                  options={filters.rumah_sakit || []}
                  selected={selectedRS}
                  onChange={setSelectedRS}
                />
              )}
              <MultiSelectDropdown
                label="Tahun"
                options={filters.tahun || []}
                selected={selectedTahun}
                onChange={setSelectedTahun}
                formatLabel={v => String(v)}
              />
            </div>

            {activeChips.length > 0 && (
              <div className="active-filters">
                {activeChips.map((chip, i) => (
                  <div key={i} className="filter-chip">
                    {chip.label}
                    <button className="chip-remove" onClick={() => removeChip(chip)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!searched && !loading && (
            <div className="state-box">
              <div className="state-icon">🔎</div>
              <div className="state-title">Cari Layanan Medis</div>
              <div className="state-sub">Ketik nama tindakan atau layanan, pilih filter jika perlu, lalu tekan Cari.</div>
            </div>
          )}

          {searched && (
            <>
              {!loading && results.length > 0 && (
                <div className="results-meta">
                  <div className="results-count">
                    Menampilkan <span>{results.length}</span> hasil untuk "<span>{query}</span>"
                  </div>
                  <div className="sort-group">
                    Urutkan harga:
                    <button className={`sort-btn ${sort === 'desc' ? 'active' : ''}`} onClick={() => setSort('desc')}>
                      Termahal ↓
                    </button>
                    <button className={`sort-btn ${sort === 'asc' ? 'active' : ''}`} onClick={() => setSort('asc')}>
                      Termurah ↑
                    </button>
                  </div>
                </div>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tahun</th>
                      {showRS && <th>Rumah Sakit</th>}
                      <th>Kategori</th>
                      <th>Nama Layanan</th>
                      <th>Kelas Kamar</th>
                      <th className="left">Tarif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr className="loading-row">
                        <td colSpan={showRS ? 6 : 5}><div className="spinner" /></td>
                      </tr>
                    )}
                    {!loading && results.length === 0 && (
                      <tr>
                        <td colSpan={showRS ? 6 : 5} style={{ padding: '48px', textAlign: 'center' }}>
                          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: 'var(--brown)', marginBottom: 6 }}>
                            Tidak ada hasil
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            Coba kata kunci lain atau ubah filter
                          </div>
                        </td>
                      </tr>
                    )}
                    {!loading && sortedResults.map((r, i) => (
                      <tr key={i}>
                        <td><span className="td-tahun">{r.tahun}</span></td>
                        {showRS && <td><span className="td-rs">{r.rumah_sakit}</span></td>}
                        <td><span className="td-kategori">{r.kategori_harga.replace('TARIF ', '')}</span></td>
                        <td><span className="td-layanan">{highlight(r.nama_layanan, query)}</span></td>
                        <td><span className="td-kelas">{r.kelas_kamar}</span></td>
                        <td><span className="td-tarif">{formatRupiah(r.tarif)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
        <div className="scroll-btns">
          <button className="scroll-btn" onClick={scrollToTop} title="Ke Atas">↑</button>
          <button className="scroll-btn" onClick={scrollToBottom} title="Ke Bawah">↓</button>
        </div>
      </div>
    </>
  );
}
