// ─── SortableTh ─────────────────────────────────────────────────────
// Klik header untuk mengurutkan seluruh hasil (server-side) berdasarkan
// kolom ini; klik lagi untuk membalik arah.
export function SortableTh({ col, label, align, sortKeys, onSort, children }) {
  const idx = sortKeys.findIndex(k => k.col === col);
  const active = idx !== -1;
  const dir = active ? sortKeys[idx].dir : null;
  return (
    <th
      className={`th-sort ${align === 'right' ? 'right' : ''} ${active ? 'active' : ''}`}
      onClick={(e) => onSort(col, e.shiftKey)}
      title="Klik untuk urutkan · Shift+klik untuk urutan bertingkat"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="th-sort-inner">
        {label}
        {children}
        <span className="th-arrow">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
        {active && sortKeys.length > 1 && <span className="th-level">{idx + 1}</span>}
      </span>
    </th>
  );
}
