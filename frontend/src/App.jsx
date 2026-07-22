import { useState, useEffect, useRef, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "/api";

const styles = `
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

// Kolom yang bisa diurutkan (urutannya mengikuti urutan kolom tabel).
// `numeric` menentukan arah default saat kolom pertama kali dipilih.
const SORT_FIELDS = [
  { col: 'tahun', label: 'Tahun', numeric: true },
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

// ─── InfoTip ────────────────────────────────────────────────────────
// Click/tap to toggle; tap outside or Escape to close. Works on touch
// (where CSS :hover sticks) because visibility is driven by the `open`
// class, not :hover/:focus.
function InfoTip({ label, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <span
      ref={ref}
      className={`info-tip ${open ? "open" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={open}
      onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
        else if (e.key === "Escape") setOpen(false);
      }}
    >
      i
      <span className="info-tip-box">{children}</span>
    </span>
  );
}

// ─── SortableTh ─────────────────────────────────────────────────────
// Klik header untuk mengurutkan seluruh hasil (server-side) berdasarkan
// kolom ini; klik lagi untuk membalik arah.
function SortableTh({ col, label, align, sortKeys, onSort, children }) {
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

// ─── SortPanel ──────────────────────────────────────────────────────
// Pembangun urutan bertingkat ala Excel: tambah beberapa tingkat,
// pilih kolom & arah tiap tingkat, ubah prioritas, atau reset.
function SortPanel({ fields, sortKeys, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const usedCols = sortKeys.map(k => k.col);
  const firstUnused = fields.find(f => !usedCols.includes(f.col));

  const setLevel = (i, patch) => onChange(sortKeys.map((k, idx) => idx === i ? { ...k, ...patch } : k));
  const removeLevel = (i) => onChange(sortKeys.filter((_, idx) => idx !== i));
  const addLevel = () => firstUnused && onChange([...sortKeys, { col: firstUnused.col, dir: defaultDirFor(firstUnused.col) }]);
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
                  onChange={e => setLevel(i, { col: e.target.value, dir: defaultDirFor(e.target.value) })}
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
            <button className="msd-action-btn" onClick={() => onChange(DEFAULT_SORT)}>Reset</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CompareView ────────────────────────────────────────────────────
// Matriks perbandingan tarif: baris = layanan (+ dimensi tetap), kolom =
// nilai sumbu terpilih. Sel termurah/termahal per baris disorot.
function fixedLabel(fixed, hideRS) {
  const order = ['rumah_sakit', 'tahun', 'kelas_kamar'];
  return order
    .filter(k => fixed[k] != null && fixed[k] !== '' && !(hideRS && k === 'rumah_sakit'))
    .map(k => (k === 'kelas_kamar' ? `Kelas ${fixed[k]}` : String(fixed[k])))
    .join(' · ');
}

function CompareView({ apiParams, axes, showRS }) {
  const [axis, setAxis] = useState(axes[0]?.key || 'tahun');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Jaga axis tetap valid bila daftar sumbu berubah
  useEffect(() => {
    if (!axes.some(a => a.key === axis)) setAxis(axes[0]?.key || 'tahun');
  }, [axes, axis]);

  useEffect(() => {
    if (!apiParams) return;
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`${API}/compare?${apiParams}&axis=${axis}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('Gagal memuat perbandingan.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiParams, axis]);

  const columns = data?.columns || [];

  return (
    <div>
      <div className="compare-bar">
        Bandingkan antar:
        {axes.map(a => (
          <button
            key={a.key}
            className={`sort-btn ${axis === a.key ? 'active' : ''}`}
            onClick={() => setAxis(a.key)}
          >
            {a.label}
          </button>
        ))}
        {data?.truncated && (
          <span className="compare-note">Menampilkan {data.rows.length} dari {data.total} baris teratas</span>
        )}
      </div>

      {error && (
        <div className="state-box" style={{ padding: '40px' }}><div className="state-sub">{error}</div></div>
      )}

      {!error && (
        <div className="table-wrap">
          <table className="pivot-table">
            <thead>
              <tr>
                <th className="pivot-corner">Layanan</th>
                {columns.map(c => (
                  <th key={c} className="right">{axis === 'kelas_kamar' ? `Kelas ${c}` : c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="loading-row"><td colSpan={columns.length + 1}><div className="spinner" /></td></tr>
              )}
              {!loading && (!data || data.rows.length === 0) && (
                <tr>
                  <td colSpan={Math.max(columns.length + 1, 1)} style={{ padding: '44px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Tidak ada data untuk dibandingkan
                  </td>
                </tr>
              )}
              {!loading && data && data.rows.map((row, i) => {
                const vals = columns.map(c => row.cells[c]).filter(v => v != null);
                const min = vals.length ? Math.min(...vals) : null;
                const max = vals.length ? Math.max(...vals) : null;
                const multi = vals.length > 1;
                return (
                  <tr key={i}>
                    <td className="pivot-head">
                      <div className="pivot-name">{row.nama_layanan}</div>
                      <div className="pivot-sub">
                        {row.kategori_harga.replace('TARIF ', '')}
                        {fixedLabel(row.fixed, !showRS) && <> · {fixedLabel(row.fixed, !showRS)}</>}
                      </div>
                    </td>
                    {columns.map(c => {
                      const v = row.cells[c];
                      const cls = v == null ? '' : (multi && v === min ? 'cheapest' : (multi && v === max ? 'priciest' : ''));
                      return (
                        <td key={c} className={`pivot-cell ${cls}`}>{v != null ? formatRupiah(v) : '—'}</td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────
function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const delta = 2;
  const left = page - delta;
  const right = page + delta;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= left && i <= right)) {
      pages.push(i);
    }
  }

  const withEllipsis = [];
  let prev = null;
  for (const p of pages) {
    if (prev && p - prev > 1) withEllipsis.push('...');
    withEllipsis.push(p);
    prev = p;
  }

  return (
    <div className="pagination">
      <button className="page-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>‹</button>
      {withEllipsis.map((p, i) =>
        p === '...'
          ? <span key={`e${i}`} className="page-ellipsis">…</span>
          : <button
              key={p}
              className={`page-btn ${p === page ? 'active' : ''}`}
              onClick={() => onPage(p)}
            >{p}</button>
      )}
      <button className="page-btn" onClick={() => onPage(page + 1)} disabled={page === totalPages}>›</button>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────
export default function App() {
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

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const scrollToBottom = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

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
  const sortFields = SORT_FIELDS.filter(f => f.col !== 'rumah_sakit' || showRS);
  // Sumbu perbandingan yang tersedia (RS hanya bila multi-RS)
  const compareAxes = [
    ...(showRS ? [{ key: 'rumah_sakit', label: 'Rumah Sakit' }] : []),
    { key: 'tahun', label: 'Tahun' },
    { key: 'kelas_kamar', label: 'Kelas Kamar' },
  ];

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <header className="header">
          <div className="header-icon">📒</div>
          <div>
            <div className="header-title">Buku Tarif</div>
            <div className="header-sub">Pencarian tarif layanan & tindakan medis rumah sakit · by ASO</div>
          </div>
        </header>

        <main className="main">
          <div className="search-card">
            <div className="search-label">Filter</div>
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
                      <SortPanel fields={sortFields} sortKeys={sortKeys} onChange={applySortKeys} />
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
                        <td colSpan={showRS ? 7 : 6}><div className="spinner" /></td>
                      </tr>
                    )}
                    {!loading && results.length === 0 && (
                      <tr>
                        <td colSpan={showRS ? 7 : 6} style={{ padding: '52px', textAlign: 'center' }}>
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

        <div className="scroll-btns">
          <button className="scroll-btn" onClick={scrollToTop} title="Ke Atas">↑</button>
          <button className="scroll-btn" onClick={scrollToBottom} title="Ke Bawah">↓</button>
        </div>
      </div>
    </>
  );
}
