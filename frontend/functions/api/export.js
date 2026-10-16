import { parseMulti, json } from './_supabase.js';
import { pickShards, callShards } from './_shards.js';
import { mergeSorted } from './_merge.js';

const EXPORT_MAX_ROWS = 50000;

// Ported unchanged from the old Express backend (pure formatting):
//   EXPORT_HEADERS, exportRow(), csvCell(), escapeXml(), buildSpreadsheetML()
const EXPORT_HEADERS = ['Tahun', 'Rumah Sakit', 'Kategori', 'Nama Layanan', 'Kelas Kamar', 'Tarif', '% vs Tahun Lalu'];

function exportRow(r) {
  return [
    r.tahun,
    r.rumah_sakit,
    (r.kategori_harga || '').replace('TARIF ', ''),
    r.nama_layanan,
    r.kelas_kamar,
    r.tarif,
    r.pct_increase != null ? r.pct_increase : ''
  ];
}

// Bungkus sel CSV; pakai delimiter ';' agar cocok dengan Excel locale id-ID
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function escapeXml(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Bangun file Excel SpreadsheetML 2003 (XML) tanpa dependensi.
// Dibuka langsung oleh Excel/LibreOffice/Google Sheets, mendukung header tebal
// serta format angka (#,##0) dan persen (0.00%).
function buildSpreadsheetML(rows) {
  const numCell = (v, styleId) =>
    v == null || v === '' ? '<Cell/>'
      : `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ''}><Data ss:Type="Number">${v}</Data></Cell>`;
  const strCell = (v) => `<Cell><Data ss:Type="String">${escapeXml(v)}</Data></Cell>`;

  const headerRow = `<Row>${EXPORT_HEADERS
    .map(h => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
    .join('')}</Row>`;

  const bodyRows = rows.map(r => {
    const pct = r.pct_increase != null ? r.pct_increase / 100 : null;
    return '<Row>' + [
      numCell(r.tahun),
      strCell(r.rumah_sakit),
      strCell((r.kategori_harga || '').replace('TARIF ', '')),
      strCell(r.nama_layanan),
      strCell(r.kelas_kamar),
      numCell(r.tarif, 'rp'),
      numCell(pct, 'pct'),
    ].join('') + '</Row>';
  }).join('');

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<?mso-application progid="Excel.Sheet"?>\n'
    + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
    + '<Styles>'
    + '<Style ss:ID="hdr"><Font ss:Bold="1"/></Style>'
    + '<Style ss:ID="rp"><NumberFormat ss:Format="#,##0"/></Style>'
    + '<Style ss:ID="pct"><NumberFormat ss:Format="0.00%"/></Style>'
    + '</Styles>\n'
    + '<Worksheet ss:Name="Buku Tarif"><Table>\n'
    + headerRow + '\n' + bodyRows + '\n'
    + '</Table></Worksheet>\n</Workbook>';
}

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const q = (p.get('q') || '').trim() || null;
  const f_kategori    = parseMulti(p, 'kategori');
  const f_rumah_sakit = parseMulti(p, 'rumah_sakit');
  const f_tahun       = parseMulti(p, 'tahun')?.map(Number) ?? null;
  const f_kelas       = parseMulti(p, 'kelas_kamar');
  const sort = p.get('sort') || null;

  const hasAny = Boolean(q) || f_kategori || f_rumah_sakit || f_tahun || f_kelas;
  if (!hasAny) return json({ error: 'Tidak ada filter atau kata kunci untuk diekspor' }, 400);

  const shards = await pickShards(env, f_rumah_sakit);
  // Reuse search_tarif with a large page_size to get every filtered row (with pct + sort)
  const { ok, failed } = await callShards(shards, 'search_tarif', {
    q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, sort, page: 1, page_size: EXPORT_MAX_ROWS,
  });
  if (!ok.length) return json({ error: failed[0].error }, 500);
  const rows = ok.length === 1
    ? ok[0].data
    : mergeSorted(ok.map(r => r.data), sort, 0, EXPORT_MAX_ROWS);
  // Some shards down: the file is still produced from the healthy ones
  const partial = failed.length ? { 'x-partial-shards': failed.map(f => f.shard).join(',') } : {};

  const stamp = new Date().toISOString().slice(0, 10);

  if (p.get('format') === 'xlsx') {
    return new Response(buildSpreadsheetML(rows), {
      headers: {
        'content-type': 'application/vnd.ms-excel; charset=utf-8',
        'content-disposition': `attachment; filename="buku-tarif-${stamp}.xls"`,
        ...partial,
      },
    });
  }

  const lines = [EXPORT_HEADERS.map(csvCell).join(';')];
  for (const r of rows) lines.push(exportRow(r).map(csvCell).join(';'));
  const csv = '﻿' + lines.join('\r\n'); // BOM for Excel id-ID UTF-8

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="buku-tarif-${stamp}.csv"`,
      ...partial,
    },
  });
}
