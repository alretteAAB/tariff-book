// Login Cloudflare Access di sisi browser.
//
// Situs ini (saat Access aktif) hanya bisa dibuka setelah login OTP email
// kantor; sesi berlaku beberapa jam. Kalau sesi habis saat halaman masih
// terbuka, panggilan ke /api tidak lagi berisi data:
//  - Access mengalihkan (redirect) ke halaman loginnya, atau
//  - middleware API membalas 401 { error: "login_required" }.
// installSessionGuard() membungkus fetch untuk /api saja: redirect tidak
// diikuti (supaya tidak berakhir sebagai error CORS yang tak jelas), dan kedua
// kasus di atas menandai sesi habis. App lalu menampilkan "Sesi login habis"
// dengan tombol untuk masuk lagi.

let expired = false;
const listeners = new Set();

function markExpired() {
  if (expired) return;
  expired = true;
  listeners.forEach(fn => fn());
}

export const isSessionExpired = () => expired;
export function onSessionExpired(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function isApiRequest(input) {
  try {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function installSessionGuard() {
  if (window.__sessionGuardInstalled) return;
  window.__sessionGuardInstalled = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    if (!isApiRequest(input)) return original(input, init);
    const res = await original(input, { redirect: 'manual', ...init });
    if (res.type === 'opaqueredirect') {
      markExpired();
    } else if (res.status === 401) {
      const body = await res.clone().json().catch(() => null);
      if (body?.error === 'login_required') markExpired();
    }
    return res;
  };
}

// Email yang sedang login (dari Cloudflare Access), atau null kalau situs
// tidak dilindungi Access (lokal, atau production sebelum Access dipasang).
export async function fetchLoginEmail() {
  try {
    const res = await fetch('/cdn-cgi/access/get-identity', { credentials: 'same-origin' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
    const id = await res.json();
    return typeof id?.email === 'string' ? id.email : null;
  } catch {
    return null;
  }
}
