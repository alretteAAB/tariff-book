// Utilitas kecil yang dipakai lintas tab.

// API kini satu origin dengan SPA (Cloudflare Pages Functions di functions/api/*),
// jadi basenya dipatok. Jangan kembalikan ke env var: nilainya disisipkan saat build,
// sehingga nilai basi di dashboard bisa mengarahkan seluruh fetch ke host yang mati.
export const API = "/api";

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
