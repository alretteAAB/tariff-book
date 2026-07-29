// Seluruh CSS aplikasi, disuntikkan sekali oleh App lewat <style>.
// Sengaja tetap satu berkas: hampir semua kelas (.main, .search-card,
// .table-wrap, .msd-*, tabel) dipakai bersama oleh kedua tab.
export const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #f4f0e8;
    --surface: #fdfcf9;
    --card: #ffffff;
    --card-2: #f8f5ed;
    --border: #e0d4bc;
    --border-mid: #c4aa80;
    --gold: #8a6010;
    --gold-light: #c9972c;
    --gold-dark: #5c4008;
    --gold-dim: rgba(138,96,16,0.07);
    --gold-dim2: rgba(138,96,16,0.12);
    --text: #1c1208;
    --text-muted: #78644a;
    --text-dim: #a89070;
    --white: #fff;
    --radius: 8px;
    --radius-sm: 5px;
    --font-display: 'Lato', sans-serif;
    --font-body: 'Lato', sans-serif;
    --font-mono: 'Lato', sans-serif;
    --shadow: 0 2px 12px rgba(0,0,0,0.07);
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
  }

  body {
    background: var(--bg);
    font-family: var(--font-body);
    color: var(--text);
    min-height: 100vh;
    background-image: radial-gradient(circle, rgba(138,96,16,0.055) 1px, transparent 1px);
    background-size: 30px 30px;
    background-attachment: fixed;
  }

  .app { min-height: 100vh; width: 100%; }

  /* ─── HEADER ──────────────────────────────────────── */
  .header {
    background: var(--card);
    border-bottom: 1px solid var(--border);
    padding: 18px 40px;
    display: flex;
    align-items: center;
    gap: 14px;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 12px rgba(0,0,0,0.07);
    animation: slideDown 0.4s ease both;
  }
  .header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent 0%, var(--gold) 40%, var(--gold-light) 60%, transparent 100%);
  }
  .header-icon {
    width: 38px; height: 38px;
    background: var(--gold-dim);
    border: 1px solid var(--border-mid);
    border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
    font-size: 17px;
    flex-shrink: 0;
  }
  .header-title {
    font-family: var(--font-display);
    font-size: 24px; font-weight: 600;
    color: var(--text);
    letter-spacing: 0.8px;
    line-height: 1;
  }
  .header-sub {
    font-size: 11px; color: var(--text-muted);
    margin-top: 3px; font-weight: 400;
    letter-spacing: 0.3px;
  }

  /* ─── MAIN ────────────────────────────────────────── */
  .main {
    max-width: 100%;
    padding: 30px 40px 80px;
    animation: fadeUp 0.4s ease 0.08s both;
  }

  /* ─── SEARCH CARD ─────────────────────────────────── */
  .search-card {
    background: var(--card);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    padding: 22px;
    box-shadow: var(--shadow);
    margin-bottom: 22px;
  }
  .search-label {
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 2px;
    color: var(--gold); margin-bottom: 13px;
    opacity: 0.85;
  }
  .search-row {
    display: flex;
    gap: 10px;
    align-items: stretch;
    flex-wrap: nowrap;
  }

  /* ─── INPUT ───────────────────────────────────────── */
  .input-wrap {
    position: relative; flex: 1; min-width: 200px;
  }
  .search-input {
    width: 100%;
    padding: 11px 36px 11px 40px;
    font-family: var(--font-body);
    font-size: 14px; color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  }
  .search-input:focus {
    border-color: var(--gold);
    box-shadow: 0 0 0 3px rgba(138,96,16,0.1);
    background: var(--card-2);
  }
  .search-input::placeholder { color: var(--text-dim); opacity: 1; }
  .input-icon {
    position: absolute; left: 13px; top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted); font-size: 14px;
    pointer-events: none;
  }
  .clear-btn {
    position: absolute; right: 10px; top: 50%;
    transform: translateY(-50%);
    background: none; border: none;
    color: var(--text-muted); cursor: pointer;
    font-size: 13px; padding: 2px; line-height: 1;
    transition: color 0.15s;
  }
  .clear-btn:hover { color: var(--text); }

  /* ─── SUGGESTIONS ─────────────────────────────────── */
  .suggestions {
    position: absolute;
    top: calc(100% + 5px); left: 0; right: 0;
    background: var(--card-2);
    border: 1px solid var(--border-mid);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lg);
    z-index: 200; overflow: hidden;
    animation: fadeIn 0.12s ease;
  }
  .suggestion-item {
    padding: 10px 13px; font-size: 13px; cursor: pointer;
    display: flex; align-items: center; gap: 10px;
    transition: background 0.1s;
    border-bottom: 1px solid var(--border);
  }
  .suggestion-item:last-child { border-bottom: none; }
  .suggestion-item:hover { background: var(--gold-dim); }
  .suggestion-icon { color: var(--gold); font-size: 11px; flex-shrink: 0; opacity: 0.6; }
  .suggestion-text mark {
    background: rgba(138,96,16,0.12); color: var(--gold);
    border-radius: 2px; padding: 0 2px; font-weight: 600;
  }
  .suggestion-cat {
    font-size: 10px; color: var(--text-muted); margin-top: 2px;
    letter-spacing: 0.5px; text-transform: uppercase;
  }

  /* ─── SEARCH BUTTON ───────────────────────────────── */
  .search-btn {
    padding: 11px 28px;
    background: var(--gold);
    color: #fff; border: none;
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: 13px; font-weight: 600; cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    white-space: nowrap; letter-spacing: 0.5px;
    align-self: flex-start;
    flex-shrink: 0;
  }
  .search-btn:hover { background: var(--gold-light); }
  .search-btn:active { transform: scale(0.98); }
  .search-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }

  /* ─── FILTERS ─────────────────────────────────────── */
  .filter-row {
    display: flex; gap: 7px; flex-wrap: wrap;
    margin-top: 10px;
  }

  /* ─── MULTI SELECT DROPDOWN ───────────────────────── */
  .msd-wrap { position: relative; }
  .msd-trigger {
    display: flex; align-items: center; gap: 7px;
    padding: 6px 11px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: 12px; font-weight: 500;
    color: var(--text-muted); cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    white-space: nowrap; user-select: none;
    min-width: 120px;
  }
  .msd-trigger:hover { border-color: var(--border-mid); color: var(--text); }
  .msd-trigger.open {
    border-color: var(--gold); color: var(--text);
    background: var(--card);
  }
  .msd-trigger.has-selection {
    border-color: var(--gold);
    color: var(--gold);
    background: var(--gold-dim);
  }
  .msd-label { flex: 1; text-align: left; }
  .msd-badge {
    background: var(--gold); color: #fff;
    border-radius: 10px;
    font-size: 10px; font-weight: 700;
    padding: 1px 5px; line-height: 1.6;
  }
  .msd-arrow { font-size: 9px; color: var(--text-muted); transition: transform 0.15s; }
  .msd-trigger.open .msd-arrow { transform: rotate(180deg); }

  .msd-menu {
    position: absolute; top: calc(100% + 5px); left: 0;
    min-width: 240px; max-width: 320px;
    background: var(--card-2);
    border: 1px solid var(--border-mid);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lg);
    z-index: 150; overflow: hidden;
    animation: fadeIn 0.12s ease;
  }
  .msd-search-wrap {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
  }
  .msd-search {
    width: 100%; padding: 6px 10px;
    font-family: var(--font-body); font-size: 12px;
    color: var(--text); background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px; outline: none;
    transition: border-color 0.15s;
  }
  .msd-search:focus { border-color: var(--gold); }
  .msd-actions {
    display: flex;
    border-bottom: 1px solid var(--border);
  }
  .msd-action-btn {
    flex: 1; padding: 6px;
    background: none; border: none;
    font-family: var(--font-body);
    font-size: 11px; font-weight: 600;
    color: var(--gold); cursor: pointer;
    transition: background 0.1s; letter-spacing: 0.3px;
  }
  .msd-action-btn:hover { background: var(--gold-dim); }
  .msd-action-btn:first-child { border-right: 1px solid var(--border); }
  .msd-list {
    max-height: 200px; overflow-y: auto; padding: 4px 0;
  }
  .msd-list::-webkit-scrollbar { width: 3px; }
  .msd-list::-webkit-scrollbar-track { background: transparent; }
  .msd-list::-webkit-scrollbar-thumb { background: var(--border-mid); border-radius: 2px; }
  .msd-item {
    display: flex; align-items: center; gap: 9px;
    padding: 8px 12px; cursor: pointer;
    transition: background 0.1s; font-size: 12px;
    color: var(--text-muted);
  }
  .msd-item:hover { background: var(--gold-dim); color: var(--text); }
  .msd-item.checked { color: var(--text); }
  .msd-checkbox {
    width: 14px; height: 14px; flex-shrink: 0;
    border: 1px solid var(--border-mid);
    border-radius: 3px; display: flex;
    align-items: center; justify-content: center;
    transition: all 0.12s; background: var(--surface);
  }
  .msd-item.checked .msd-checkbox {
    background: var(--gold); border-color: var(--gold);
  }
  .msd-checkmark {
    color: #fff; font-size: 9px; font-weight: 700; display: none;
  }
  .msd-item.checked .msd-checkmark { display: block; }
  .msd-item-text { flex: 1; line-height: 1.3; }
  .msd-empty {
    padding: 14px; text-align: center;
    font-size: 12px; color: var(--text-muted);
  }

  /* ─── FILTER GUIDANCE ─────────────────────────────── */
  .filter-guidance {
    margin-top: 10px;
    padding: 7px 12px;
    background: rgba(138,96,16,0.05);
    border-left: 2px solid rgba(138,96,16,0.35);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
  }
  .filter-guidance-text p {
    font-size: 11px; color: var(--text-muted);
    line-height: 1.6; letter-spacing: 0.2px;
  }
  .filter-guidance-text p:first-child {
    font-weight: 600; color: var(--gold); margin-bottom: 1px;
  }
  .filter-guidance-close {
    background: none; border: none;
    color: var(--text-dim); cursor: pointer;
    font-size: 14px; padding: 0; line-height: 1;
    flex-shrink: 0; transition: color 0.15s;
    margin-top: 2px;
  }
  .filter-guidance-close:hover { color: var(--text-muted); }

  /* ─── ACTIVE FILTER TABLE ─────────────────────────── */
  .active-filters {
    display: flex; flex-direction: column;
    margin-top: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--surface);
  }
  .active-filters-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px;
    padding: 7px 10px;
    background: var(--card-2);
    border-bottom: 1px solid var(--border);
  }
  .active-filters.collapsed .active-filters-header { border-bottom: none; }
  .active-filters-title {
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--gold);
    display: flex; align-items: center; gap: 6px;
  }
  .active-filters-toggle {
    display: flex; align-items: center; gap: 5px;
    background: none; border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 3px 9px;
    font-family: var(--font-body); font-size: 11px; font-weight: 600;
    color: var(--text-muted); cursor: pointer;
    transition: border-color 0.12s, color 0.12s;
  }
  .active-filters-toggle:hover { border-color: var(--gold); color: var(--gold); }
  .filter-group-row {
    display: grid;
    grid-template-columns: 130px 1fr auto;
    align-items: center; gap: 10px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border);
  }
  .filter-group-row:last-child { border-bottom: none; }
  .filter-group-name {
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--text-muted);
  }
  .filter-group-values {
    display: flex; flex-wrap: wrap; gap: 5px;
  }
  .filter-group-clear {
    background: none; border: 1px solid var(--border);
    color: var(--text-dim); cursor: pointer;
    width: 20px; height: 20px; border-radius: 50%;
    font-size: 10px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    transition: border-color 0.12s, color 0.12s;
    flex-shrink: 0;
  }
  .filter-group-clear:hover { border-color: var(--gold); color: var(--gold); }
  @media (max-width: 680px) {
    .filter-group-row { grid-template-columns: 90px 1fr auto; }
    .filter-group-name { font-size: 9px; }
  }
  .filter-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 8px 3px 10px;
    background: var(--gold-dim);
    border: 1px solid rgba(138,96,16,0.22);
    border-radius: 20px;
    font-size: 11px; font-weight: 500;
    color: var(--gold); letter-spacing: 0.2px;
  }
  .chip-remove {
    background: none; border: none;
    color: var(--gold); cursor: pointer;
    font-size: 10px; padding: 0 2px; line-height: 1;
    opacity: 0.55; transition: opacity 0.12s;
  }
  .chip-remove:hover { opacity: 1; }

  /* ─── RESULTS META ────────────────────────────────── */
  .results-meta {
    display: flex; align-items: center;
    justify-content: space-between;
    margin-bottom: 13px; flex-wrap: wrap; gap: 8px;
  }
  .results-count {
    font-size: 12px; color: var(--text-muted); font-weight: 400; letter-spacing: 0.2px;
  }
  .results-count span { color: var(--gold); font-weight: 600; }

  /* ─── SORT ────────────────────────────────────────── */
  .sort-group {
    display: flex; align-items: center;
    gap: 5px; font-size: 11px; color: var(--text-muted);
    letter-spacing: 0.4px;
  }
  .sort-btn {
    padding: 4px 10px; border-radius: 20px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-family: var(--font-body);
    font-size: 11px; font-weight: 500;
    cursor: pointer; transition: all 0.12s; color: var(--text-muted);
  }
  .sort-btn.active {
    background: var(--gold); border-color: var(--gold);
    color: #fff; font-weight: 600;
  }
  .sort-btn:not(.active):hover { border-color: var(--gold); color: var(--gold); }

  /* ─── SORTABLE HEADERS ────────────────────────────── */
  .th-sort { cursor: pointer; user-select: none; transition: color 0.12s, background 0.12s; }
  .th-sort:hover { color: var(--gold); background: var(--gold-dim); }
  .th-sort.active { color: var(--gold); }
  .th-sort-inner { display: inline-flex; align-items: center; gap: 5px; }
  .th-arrow { font-size: 9px; opacity: 0.4; }
  .th-sort:hover .th-arrow, .th-sort.active .th-arrow { opacity: 1; }
  .th-level {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 14px; height: 14px; padding: 0 3px;
    background: var(--gold); color: #fff;
    border-radius: 7px; font-size: 9px; font-weight: 700; line-height: 1;
  }

  /* ─── SORT PANEL (urutan bertingkat) ──────────────── */
  /* Anchor ke kanan agar tidak keluar dari tepi layar (trigger paling kanan) */
  .sort-panel { min-width: 320px; max-width: 380px; padding: 8px; left: auto; right: 0; }
  .sort-level { display: flex; align-items: center; gap: 6px; padding: 5px 4px; }
  .sort-level-tag {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--text-muted); width: 30px; flex-shrink: 0;
  }
  .sort-select {
    flex: 1; min-width: 0; padding: 5px 7px;
    font-family: var(--font-body); font-size: 12px;
    color: var(--text); background: var(--surface);
    border: 1px solid var(--border); border-radius: 4px;
    outline: none; cursor: pointer;
  }
  .sort-select:focus { border-color: var(--gold); }
  .sort-dir-btn {
    padding: 5px 8px; min-width: 86px; flex-shrink: 0;
    white-space: nowrap; text-align: center;
    font-family: var(--font-body); font-size: 11px; font-weight: 600;
    color: var(--gold); background: var(--gold-dim);
    border: 1px solid rgba(138,96,16,0.22); border-radius: 4px;
    cursor: pointer; transition: background 0.12s;
  }
  .sort-dir-btn:hover { background: var(--gold-dim2); }
  .sort-level-actions { display: flex; gap: 2px; flex-shrink: 0; }
  .sort-level-actions button {
    width: 22px; height: 24px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; color: var(--text-muted); cursor: pointer;
    font-size: 10px; line-height: 1; transition: border-color 0.12s, color 0.12s;
  }
  .sort-level-actions button:hover:not(:disabled) { border-color: var(--gold); color: var(--gold); }
  .sort-level-actions button:disabled { opacity: 0.3; cursor: not-allowed; }
  .sort-panel-actions {
    display: flex; gap: 6px; margin-top: 6px;
    padding-top: 8px; border-top: 1px solid var(--border);
  }
  .sort-panel-actions .msd-action-btn {
    border: 1px solid var(--border); border-radius: 4px;
  }
  .sort-panel-actions .msd-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ─── VIEW TABS ───────────────────────────────────── */
  .view-tabs {
    display: inline-flex; gap: 2px; margin-bottom: 14px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 3px;
  }
  .view-tab {
    padding: 6px 18px; border: none; background: none;
    font-family: var(--font-body); font-size: 12px; font-weight: 600;
    color: var(--text-muted); cursor: pointer; border-radius: 4px;
    transition: background 0.12s, color 0.12s; letter-spacing: 0.3px;
  }
  .view-tab:hover { color: var(--text); }
  .view-tab.active { background: var(--gold); color: #fff; }

  /* ─── EXPORT ──────────────────────────────────────── */
  .results-tools { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .export-group {
    display: flex; align-items: center; gap: 5px;
    font-size: 11px; color: var(--text-muted); letter-spacing: 0.4px;
  }
  .export-btn {
    padding: 4px 12px; border-radius: 20px;
    border: 1px solid var(--border); background: var(--surface);
    font-family: var(--font-body); font-size: 11px; font-weight: 600;
    color: var(--text-muted); cursor: pointer; transition: all 0.12s;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .export-btn:hover:not(:disabled) { border-color: var(--gold); color: var(--gold); }
  .export-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ─── COMPARE / PIVOT ─────────────────────────────── */
  .compare-bar {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    margin-bottom: 13px; font-size: 11px; color: var(--text-muted);
    letter-spacing: 0.4px;
  }
  .compare-note { color: var(--text-dim); font-size: 11px; margin-left: 6px; }
  .pivot-table th.pivot-corner {
    text-align: left; position: sticky; left: 0; z-index: 2;
    background: var(--surface);
  }
  .pivot-head {
    position: sticky; left: 0; z-index: 1;
    background: var(--card);
    border-right: 1px solid var(--border-mid);
    min-width: 230px; max-width: 320px;
  }
  tbody tr:hover .pivot-head { background: #fbf7ee; }
  .pivot-name { font-weight: 600; color: var(--text); line-height: 1.3; }
  .pivot-sub {
    font-size: 10px; color: var(--text-muted); margin-top: 2px;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .pivot-cell {
    text-align: right; white-space: nowrap;
    font-size: 13px; font-variant-numeric: tabular-nums; color: var(--text);
  }
  .pivot-cell.cheapest { color: #2e7d32; font-weight: 700; background: rgba(46,125,50,0.08); }
  .pivot-cell.priciest { color: var(--gold-dark); font-weight: 700; background: var(--gold-dim); }

  /* ─── TABLE ───────────────────────────────────────── */
  .table-wrap {
    background: var(--card);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    overflow-x: auto;
    box-shadow: var(--shadow);
  }
  table { min-width: 600px; width: 100%; border-collapse: collapse; font-size: 13px; }
  thead tr {
    background: var(--surface);
    border-bottom: 1px solid var(--border-mid);
  }
  th {
    padding: 11px 16px; text-align: left;
    font-family: var(--font-body);
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1.3px;
    color: var(--text-muted); white-space: nowrap;
  }
  th.right { text-align: right; }
  tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background 0.12s, box-shadow 0.12s;
  }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover {
    background: rgba(138,96,16,0.04);
    box-shadow: inset 3px 0 0 var(--gold);
  }
  td {
    padding: 12px 16px; vertical-align: middle;
    color: var(--text); line-height: 1.4;
  }
  .td-kategori {
    font-size: 10px; font-weight: 600;
    color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .td-kategori mark {
    background: rgba(138,96,16,0.12); color: var(--gold);
    border-radius: 2px; padding: 0 2px; font-weight: 700;
  }
  .td-layanan { font-weight: 500; color: var(--text); }
  .td-layanan mark {
    background: rgba(138,96,16,0.12); color: var(--gold);
    border-radius: 2px; padding: 0 2px; font-weight: 600;
  }
  .td-kelas {
    display: inline-block; padding: 2px 8px;
    background: rgba(138,96,16,0.07);
    border: 1px solid rgba(138,96,16,0.18);
    border-radius: 20px;
    font-size: 11px; font-weight: 500;
    color: var(--text-muted); white-space: nowrap;
  }
  .td-rs { font-size: 11px; color: var(--text-muted); }
  .td-tahun {
    font-size: 13px; font-weight: 400;
    color: var(--text-muted);
  }
  .td-tarif {
    text-align: right;
    font-size: 13px; font-weight: 700;
    color: var(--gold); white-space: nowrap;
  }
  .td-pct {
    font-size: 13px; color: var(--text-muted);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }

  /* ─── INFO TOOLTIP ────────────────────────────────── */
  .info-tip {
    position: relative;
    display: inline-flex;
    align-items: center; justify-content: center;
    width: 14px; height: 14px;
    margin-left: 5px;
    border: 1px solid var(--border-mid);
    border-radius: 50%;
    color: var(--text-muted);
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 10px; font-weight: 700; font-style: italic;
    line-height: 1; cursor: help;
    vertical-align: middle; user-select: none;
    transition: border-color 0.15s, color 0.15s;
  }
  .info-tip:focus { outline: none; }
  .info-tip.open { border-color: var(--gold); color: var(--gold); }
  .info-tip-box {
    position: absolute;
    top: calc(100% + 8px); right: 0;
    width: 240px;
    background: var(--card);
    border: 1px solid var(--border-mid);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lg);
    padding: 10px 12px;
    font-family: var(--font-body);
    font-size: 11px; font-weight: 400; line-height: 1.55;
    color: var(--text-muted);
    text-align: left; text-transform: none; letter-spacing: normal;
    white-space: normal; z-index: 300;
    opacity: 0; visibility: hidden;
    transform: translateY(-4px);
    transition: opacity 0.15s, transform 0.15s, visibility 0.15s;
  }
  .info-tip-box::before {
    content: '';
    position: absolute;
    bottom: 100%; right: 4px;
    border: 6px solid transparent;
    border-bottom-color: var(--border-mid);
  }
  .info-tip.open .info-tip-box {
    opacity: 1; visibility: visible; transform: translateY(0);
  }
  /* Hover preview only on devices that truly hover (mouse), so touch taps
     rely solely on the toggle and never get stuck open. */
  @media (hover: hover) {
    .info-tip:hover { border-color: var(--gold); color: var(--gold); }
    .info-tip:hover .info-tip-box {
      opacity: 1; visibility: visible; transform: translateY(0);
    }
  }

  /* ─── STATES ──────────────────────────────────────── */
  .state-box {
    background: var(--card);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    padding: 64px 24px; text-align: center;
    box-shadow: var(--shadow);
  }
  .state-icon { font-size: 34px; margin-bottom: 16px; opacity: 0.6; }
  .state-title {
    font-family: var(--font-display);
    font-size: 24px; font-weight: 500;
    color: var(--text); margin-bottom: 8px; letter-spacing: 0.5px;
  }
  .state-sub {
    font-size: 13px; color: var(--text-muted);
    max-width: 300px; margin: 0 auto; line-height: 1.7;
  }
  .state-hint {
    margin-top: 12px;
    font-size: 11px; color: var(--text-dim);
    letter-spacing: 0.3px;
  }
  .state-hint kbd {
    display: inline-block;
    padding: 1px 6px;
    background: var(--surface);
    border: 1px solid var(--border-mid);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 11px; color: var(--text-muted);
  }

  /* ─── SCROLL BUTTONS ──────────────────────────────── */
  .scroll-btns {
    position: fixed; bottom: 26px; right: 26px;
    display: flex; flex-direction: column; gap: 7px; z-index: 999;
  }
  .scroll-btn {
    width: 36px; height: 36px;
    background: var(--card);
    border: 1px solid var(--border-mid);
    color: var(--text-muted);
    border-radius: 50%;
    font-size: 14px;
    cursor: pointer;
    box-shadow: var(--shadow);
    transition: border-color 0.15s, color 0.15s, transform 0.15s;
    display: flex; align-items: center; justify-content: center;
  }
  .scroll-btn:hover {
    border-color: var(--gold); color: var(--gold);
    transform: scale(1.1);
  }

  /* ─── LOADING ─────────────────────────────────────── */
  .loading-row td { padding: 40px; text-align: center; }
  .spinner {
    display: inline-block; width: 20px; height: 20px;
    border: 2px solid var(--border-mid);
    border-top-color: var(--gold); border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  /* ─── PAGINATION ──────────────────────────────────── */
  .pagination {
    display: flex; align-items: center; justify-content: center;
    gap: 4px; margin-top: 20px; flex-wrap: wrap;
  }
  .page-btn {
    min-width: 32px; height: 32px; padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    font-family: var(--font-body);
    font-size: 12px; font-weight: 500;
    color: var(--text-muted); cursor: pointer;
    transition: all 0.12s;
    display: flex; align-items: center; justify-content: center;
  }
  .page-btn:hover:not(:disabled) { border-color: var(--gold); color: var(--gold); }
  .page-btn.active {
    background: var(--gold); border-color: var(--gold);
    color: #fff; font-weight: 700;
  }
  .page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .page-ellipsis {
    font-size: 12px; color: var(--text-muted);
    padding: 0 4px; line-height: 32px;
  }
  .pagination-info {
    text-align: center; margin-top: 8px;
    font-size: 11px; color: var(--text-dim); letter-spacing: 0.3px;
  }

  /* ─── NAV (tab halaman) ───────────────────────────── */
  .nav-tabs {
    display: inline-flex; gap: 2px; margin-left: auto;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 3px;
    flex-shrink: 0;
  }
  .nav-tab {
    padding: 7px 16px; border: none; background: none;
    font-family: var(--font-body); font-size: 12px; font-weight: 600;
    color: var(--text-muted); cursor: pointer; border-radius: 4px;
    transition: background 0.12s, color 0.12s;
    letter-spacing: 0.3px; white-space: nowrap;
  }
  .nav-tab:hover { color: var(--text); }
  .nav-tab.active { background: var(--gold); color: #fff; }

  /* ─── GOLONGAN OPERASI ────────────────────────────── */
  .td-golongan {
    display: inline-block; padding: 2px 9px;
    background: var(--gold-dim);
    border: 1px solid rgba(138,96,16,0.22);
    border-radius: 20px;
    font-size: 10px; font-weight: 700;
    color: var(--gold); white-space: nowrap;
    text-transform: uppercase; letter-spacing: 0.6px;
  }
  .td-spec {
    font-size: 10px; font-weight: 600;
    color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .td-spec mark {
    background: rgba(138,96,16,0.12); color: var(--gold);
    border-radius: 2px; padding: 0 2px; font-weight: 700;
  }

  /* ─── ANIMATIONS ──────────────────────────────────── */
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ─── RESPONSIVE ──────────────────────────────────── */
  @media (max-width: 680px) {
    .header { padding: 14px 18px; }
    .main { padding: 20px 16px 60px; }
    .search-row { flex-direction: column; }
    .search-card { padding: 16px; }
    .search-btn { width: 100%; text-align: center; justify-content: center; }
    th, td { padding: 10px 12px; }
    .header-title { font-size: 20px; }
    .header { flex-wrap: wrap; }
    .nav-tabs { width: 100%; margin-left: 0; }
    .nav-tab { flex: 1; padding: 7px 8px; text-align: center; }
  }
`;
