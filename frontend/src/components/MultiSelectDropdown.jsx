import { memo, useState, useEffect, useMemo, useRef } from "react";

// ─── MultiSelectDropdown ────────────────────────────────────────────
// isDisabled(option): opsi tampil abu-abu dan tidak bisa dicentang.
// emptyLabel: teks tombol saat belum ada yang dipilih (default "Semua <label>").
// single: hanya satu pilihan; klik langsung mengganti pilihan dan menutup menu.
// Menu menggambar paling banyak MAX_SHOWN opsi (daftar Kategori bisa ribuan);
// sisanya dicapai lewat kotak cari. Pilih/Hapus Semua tetap berlaku untuk semua
// hasil pencarian, bukan hanya yang tergambar.
const MAX_SHOWN = 300;
const toText = (v) => String(v);

export const MultiSelectDropdown = memo(function MultiSelectDropdown({ label, options, selected, onChange, formatLabel, isDisabled, emptyLabel, single }) {
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

  const fmt = formatLabel || toText;
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? options.filter(o => fmt(o).toLowerCase().includes(q)) : options;
  }, [options, search, fmt]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const selectable = isDisabled ? filtered.filter(o => !isDisabled(o)) : filtered;

  const toggle = (val) => {
    if (single) {
      onChange([val]);
      setOpen(false);
      return;
    }
    onChange(selectedSet.has(val)
      ? selected.filter(v => v !== val)
      : [...selected, val]
    );
  };

  const triggerLabel = selected.length === 0
    ? (emptyLabel ?? `Semua ${label}`)
    : single
    ? fmt(selected[0])
    : selected.length === options.length
    ? `Semua ${label}`
    : selected.length === 1
    ? fmt(selected[0]).replace('TARIF ', '')
    : `${label}`;

  const partial = selected.length > 0 && (single || selected.length < options.length);

  return (
    <div className="msd-wrap" ref={ref}>
      <div
        className={`msd-trigger ${open ? 'open' : ''} ${partial ? 'has-selection' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <span className="msd-label">{triggerLabel}</span>
        {partial && !single && (
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
          {!single && <div className="msd-actions">
            <button className="msd-action-btn" onMouseDown={e => { e.preventDefault(); onChange([...new Set([...selected, ...selectable])]); }}>
              Pilih Semua
            </button>
            <button className="msd-action-btn" onMouseDown={e => { e.preventDefault(); const drop = new Set(filtered); onChange(selected.filter(v => !drop.has(v))); }}>
              Hapus Semua
            </button>
          </div>}
          <div className="msd-list">
            {filtered.length === 0 && <div className="msd-empty">Tidak ditemukan</div>}
            {filtered.slice(0, MAX_SHOWN).map(opt => {
              const isChecked = selectedSet.has(opt);
              const disabled = isDisabled?.(opt) && !isChecked;
              return (
                <div
                  key={String(opt)}
                  className={`msd-item ${isChecked ? 'checked' : ''} ${disabled ? 'disabled' : ''}`}
                  aria-disabled={disabled || undefined}
                  onMouseDown={e => { e.preventDefault(); if (!disabled) toggle(opt); }}
                >
                  <div className="msd-checkbox">
                    <span className="msd-checkmark">✓</span>
                  </div>
                  <span className="msd-item-text">{fmt(opt).replace('TARIF ', '')}</span>
                </div>
              );
            })}
            {filtered.length > MAX_SHOWN && (
              <div className="msd-more">
                +{(filtered.length - MAX_SHOWN).toLocaleString('id-ID')} lainnya — ketik untuk mempersempit
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
