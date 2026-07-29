import { useState, useEffect, useRef } from "react";

// ─── MultiSelectDropdown ────────────────────────────────────────────
export function MultiSelectDropdown({ label, options, selected, onChange, formatLabel }) {
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
            <button className="msd-action-btn" onMouseDown={e => { e.preventDefault(); onChange([...new Set([...selected, ...filtered])]); }}>
              Pilih Semua
            </button>
            <button className="msd-action-btn" onMouseDown={e => { e.preventDefault(); onChange(selected.filter(v => !filtered.includes(v))); }}>
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
