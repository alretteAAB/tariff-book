import { useState, useEffect } from "react";
import { API, formatRupiah } from "../lib/utils.jsx";

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

export default function CompareView({ apiParams, axes, showRS }) {
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
