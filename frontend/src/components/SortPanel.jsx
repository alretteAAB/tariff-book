import { useState, useEffect, useRef } from "react";

// ─── SortPanel ──────────────────────────────────────────────────────
// Pembangun urutan bertingkat ala Excel: tambah beberapa tingkat,
// pilih kolom & arah tiap tingkat, ubah prioritas, atau reset.
export function SortPanel({ fields, sortKeys, onChange, defaultSort }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  // Arah default diambil dari `fields` yang diberikan, bukan dari SORT_FIELDS
  // global — supaya panel ini bisa dipakai ulang oleh tab lain (Golongan Operasi).
  const dirFor = (col) => fields.find(f => f.col === col)?.numeric ? 'desc' : 'asc';

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const usedCols = sortKeys.map(k => k.col);
  const firstUnused = fields.find(f => !usedCols.includes(f.col));

  const setLevel = (i, patch) => onChange(sortKeys.map((k, idx) => idx === i ? { ...k, ...patch } : k));
  const removeLevel = (i) => onChange(sortKeys.filter((_, idx) => idx !== i));
  const addLevel = () => firstUnused && onChange([...sortKeys, { col: firstUnused.col, dir: dirFor(firstUnused.col) }]);
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= sortKeys.length) return;
    const next = [...sortKeys];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="msd-wrap" ref={ref}>
      <div
        className={`msd-trigger ${open ? 'open' : ''} ${sortKeys.length > 1 ? 'has-selection' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <span className="msd-label">Urutan bertingkat</span>
        {sortKeys.length > 1 && <span className="msd-badge">{sortKeys.length}</span>}
        <span className="msd-arrow">▾</span>
      </div>

      {open && (
        <div className="msd-menu sort-panel">
          {sortKeys.map((k, i) => {
            const field = fields.find(f => f.col === k.col) || {};
            const opts = fields.filter(f => f.col === k.col || !usedCols.includes(f.col));
            return (
              <div className="sort-level" key={`${k.col}-${i}`}>
                <span className="sort-level-tag">{i === 0 ? 'Urut' : 'lalu'}</span>
                <select
                  className="sort-select"
                  value={k.col}
                  onChange={e => setLevel(i, { col: e.target.value, dir: dirFor(e.target.value) })}
                >
                  {opts.map(f => <option key={f.col} value={f.col}>{f.label}</option>)}
                </select>
                <button className="sort-dir-btn" onClick={() => setLevel(i, { dir: k.dir === 'asc' ? 'desc' : 'asc' })}>
                  {field.numeric ? (k.dir === 'asc' ? 'Smallest → Largest' : 'Largest → Smallest') : (k.dir === 'asc' ? 'A–Z' : 'Z–A')}
                </button>
                <div className="sort-level-actions">
                  <button onClick={() => move(i, -1)} disabled={i === 0} title="Naikkan prioritas">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === sortKeys.length - 1} title="Turunkan prioritas">↓</button>
                  <button onClick={() => removeLevel(i)} disabled={sortKeys.length === 1} title="Hapus tingkat">✕</button>
                </div>
              </div>
            );
          })}
          <div className="sort-panel-actions">
            <button className="msd-action-btn" onClick={addLevel} disabled={!firstUnused}>+ Tambah tingkat</button>
            <button className="msd-action-btn" onClick={() => onChange(defaultSort)}>Reset</button>
          </div>
        </div>
      )}
    </div>
  );
}
