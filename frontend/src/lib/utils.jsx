// Utilitas kecil yang dipakai lintas tab.

// API kini satu origin dengan SPA (Cloudflare Pages Functions di functions/api/*),
// jadi basenya dipatok. Jangan kembalikan ke env var: nilainya disisipkan saat build,
// sehingga nilai basi di dashboard bisa mengarahkan seluruh fetch ke host yang mati.
export const API = "/api";

// Daftar filter terakhir disimpan di browser, supaya dropdown langsung terisi
// saat halaman dibuka; versi terbaru tetap diambil di belakang layar.
const FILTERS_STORAGE_KEY = "tarif-filters-v1";
export const readStoredFilters = () => {
  try {
    const f = JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY));
    return f && Array.isArray(f.kategori) && Array.isArray(f.relations) ? f : null;
  } catch {
    return null;
  }
};
export const storeFilters = (f) => {
  try { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(f)); } catch { /* storage full or blocked */ }
};

export function highlight(text, query) {
  if (!query) return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${esc})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase() ? <mark key={i}>{p}</mark> : p
  );
}

export function formatRupiah(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0
  }).format(num);
}

export const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
export const scrollToBottom = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
