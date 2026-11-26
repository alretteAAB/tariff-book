// Cloudflare Access login check for /api (no route: underscore file).
//
// Cloudflare Access sits in front of the site: people log in with a one-time
// PIN sent to their work email, and every request that reaches the site then
// carries a signed token in the `Cf-Access-Jwt-Assertion` header. This file
// verifies that token, so the API also refuses requests that did not come
// through Access (a misconfigured or removed Access application, a hand-made
// header). See docs/access-login.md.
//
// Settings (Cloudflare Pages env vars):
//   ACCESS_TEAM_DOMAIN   e.g. "buku-tarif.cloudflareaccess.com"
//   ACCESS_AUD           the Access application's "Application Audience (AUD) tag"
//   ACCESS_EMAIL_DOMAIN  allowed email domain, default "asuransiastra.com"
// Without ACCESS_TEAM_DOMAIN or ACCESS_AUD nothing is checked, so an
// environment where Access is not set up (production during the trial, local
// development) works as before.

const DEFAULT_EMAIL_DOMAIN = 'asuransiastra.com';
const CLOCK_SKEW_S = 60;

export function accessConfig(env) {
  const team = String(env?.ACCESS_TEAM_DOMAIN || '').trim()
    .replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  const aud = String(env?.ACCESS_AUD || '').trim();
  const emailDomain = String(env?.ACCESS_EMAIL_DOMAIN || DEFAULT_EMAIL_DOMAIN).trim()
    .replace(/^@/, '').toLowerCase();
  if (!team || !aud) return null;
  return { team, aud, emailDomain, issuer: `https://${team}`, certsUrl: `https://${team}/cdn-cgi/access/certs` };
}

// "a@b.com" -> true only when the part after the last "@" is exactly the
// allowed domain ("x@asuransiastra.com.evil.com" and "x@sub.asuransiastra.com"
// are refused), with a plain ASCII local part.
export function emailAllowed(email, domain) {
  if (typeof email !== 'string') return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return false;
  return /^[a-z0-9._%+-]+$/.test(e.slice(0, at)) && e.slice(at + 1) === domain;
}

function b64urlBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

// Verify a Cloudflare Access token. getKeys() returns the team's JWKS
// ({ keys: [...] }); getKeys({ refresh: true }) must fetch a fresh copy (keys
// rotate). Returns { ok: true, email } or { ok: false, reason }.
export async function verifyAccessJwt(token, cfg, getKeys, nowS = Math.floor(Date.now() / 1000)) {
  if (!token) return { ok: false, reason: 'no token' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };

  let header, payload, signature;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
    signature = b64urlBytes(parts[2]);
  } catch {
    return { ok: false, reason: 'malformed token' };
  }
  if (header.alg !== 'RS256') return { ok: false, reason: 'unexpected algorithm' };

  let jwk = (await getKeys()).keys?.find(k => k.kid === header.kid);
  if (!jwk) jwk = (await getKeys({ refresh: true })).keys?.find(k => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: 'unknown signing key' };

  const key = await crypto.subtle.importKey(
    'jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed))) {
    return { ok: false, reason: 'bad signature' };
  }

  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(cfg.aud)) return { ok: false, reason: 'wrong audience' };
  if (payload.iss !== cfg.issuer) return { ok: false, reason: 'wrong issuer' };
  if (typeof payload.exp !== 'number' || payload.exp < nowS - CLOCK_SKEW_S) return { ok: false, reason: 'expired' };
  if (typeof payload.nbf === 'number' && payload.nbf > nowS + CLOCK_SKEW_S) return { ok: false, reason: 'not yet valid' };
  if (!emailAllowed(payload.email, cfg.emailDomain)) return { ok: false, reason: 'email not allowed' };
  return { ok: true, email: payload.email.trim().toLowerCase() };
}

// JWKS per team, cached for this isolate (refetched every 10 minutes, or at
// once when a token names a key we do not have yet).
const JWKS_TTL_MS = 10 * 60 * 1000;
const jwksCache = new Map();
export function jwksFetcher(certsUrl, fetchImpl = fetch) {
  return async ({ refresh = false } = {}) => {
    const hit = jwksCache.get(certsUrl);
    if (!refresh && hit && Date.now() - hit.at < JWKS_TTL_MS) return hit.jwks;
    const res = await fetchImpl(certsUrl);
    if (!res.ok) throw new Error(`Access certs: HTTP ${res.status}`);
    const jwks = await res.json();
    jwksCache.set(certsUrl, { at: Date.now(), jwks });
    return jwks;
  };
}
