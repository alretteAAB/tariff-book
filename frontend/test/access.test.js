import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { accessConfig, emailAllowed, verifyAccessJwt } from '../functions/api/_access.js';
import { onRequest } from '../functions/api/_middleware.js';

const TEAM = 'buku-tarif.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const cfg = accessConfig(env);

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function makeKey(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { kid, privateKey: pair.privateKey, jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } };
}
const good = await makeKey('k1');
const other = await makeKey('k2');   // a key that is not in the team's JWKS

async function sign(key, claims, header = {}) {
  const head = enc({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...header });
  const body = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

const now = Math.floor(Date.now() / 1000);
const claims = (over = {}) => ({
  aud: [AUD], iss: `https://${TEAM}`, email: 'Budi.Santoso@AsuransiAstra.com',
  iat: now, nbf: now, exp: now + 6 * 3600, ...over,
});
const keys = async () => ({ keys: [good.jwk] });

test('accessConfig: off without team or aud; normalizes the team domain', () => {
  assert.equal(accessConfig({}), null);
  assert.equal(accessConfig({ ACCESS_TEAM_DOMAIN: TEAM }), null);
  assert.equal(accessConfig({ ACCESS_AUD: AUD }), null);
  const c = accessConfig({ ACCESS_TEAM_DOMAIN: 'https://Buku-Tarif.cloudflareaccess.com/', ACCESS_AUD: AUD });
  assert.equal(c.issuer, `https://${TEAM}`);
  assert.equal(c.emailDomain, 'asuransiastra.com');
  assert.equal(accessConfig({ ...env, ACCESS_EMAIL_DOMAIN: '@Contoh.co.id' }).emailDomain, 'contoh.co.id');
});

test('emailAllowed: exact domain only', () => {
  assert.ok(emailAllowed('budi@asuransiastra.com', 'asuransiastra.com'));
  assert.ok(emailAllowed(' Budi.S+x@AsuransiAstra.com ', 'asuransiastra.com'));
  for (const bad of [
    'budi@gmail.com',
    'budi@asuransiastra.com.evil.com',
    'budi@sub.asuransiastra.com',
    'budi@evil.com@asuransiastra.co',
    'budi@asuransiastra.co',
    '@asuransiastra.com',
    'bùdi@asuransiastra.com',
    'budi@аsuransiastra.com',      // Cyrillic "а"
    '', null, undefined, 42,
  ]) assert.equal(emailAllowed(bad, 'asuransiastra.com'), false, String(bad));
});

test('verifyAccessJwt: a valid token passes and returns the email', async () => {
  const r = await verifyAccessJwt(await sign(good, claims()), cfg, keys, now);
  assert.deepEqual(r, { ok: true, email: 'budi.santoso@asuransiastra.com' });
  // aud may also be a plain string
  assert.equal((await verifyAccessJwt(await sign(good, claims({ aud: AUD })), cfg, keys, now)).ok, true);
});

test('verifyAccessJwt: refuses every kind of bad token', async () => {
  const cases = [
    ['no token', null],
    ['malformed token', 'abc.def'],
    ['malformed token', 'a.b.c'],
    ['unexpected algorithm', await sign(good, claims(), { alg: 'HS256' })],
    ['unknown signing key', await sign(other, claims())],
    ['wrong audience', await sign(good, claims({ aud: ['someone-else'] }))],
    ['wrong issuer', await sign(good, claims({ iss: 'https://evil.cloudflareaccess.com' }))],
    ['expired', await sign(good, claims({ exp: now - 3600 }))],
    ['expired', await sign(good, claims({ exp: undefined }))],
    ['not yet valid', await sign(good, claims({ nbf: now + 3600 }))],
    ['email not allowed', await sign(good, claims({ email: 'budi@gmail.com' }))],
    ['email not allowed', await sign(good, claims({ email: 'budi@asuransiastra.com.evil.com' }))],
    ['email not allowed', await sign(good, claims({ email: undefined }))],
  ];
  for (const [reason, token] of cases) {
    assert.deepEqual(await verifyAccessJwt(token, cfg, keys, now), { ok: false, reason }, reason);
  }
});

test('verifyAccessJwt: a changed payload breaks the signature', async () => {
  const [h, , s] = (await sign(good, claims({ email: 'budi@gmail.com' }))).split('.');
  const forged = `${h}.${enc(claims())}.${s}`;
  assert.deepEqual(await verifyAccessJwt(forged, cfg, keys, now), { ok: false, reason: 'bad signature' });
});

test('verifyAccessJwt: fetches fresh keys once when the key id is new (rotation)', async () => {
  const calls = [];
  const rotating = async ({ refresh = false } = {}) => {
    calls.push(refresh);
    return refresh ? { keys: [good.jwk] } : { keys: [] };
  };
  assert.equal((await verifyAccessJwt(await sign(good, claims()), cfg, rotating, now)).ok, true);
  assert.deepEqual(calls, [false, true]);
});

test('middleware: passes everything through when Access is not configured', async () => {
  let called = false;
  const res = await onRequest({ env: {}, request: new Request('https://x/api/filters'), next: async () => { called = true; return new Response('ok'); } });
  assert.equal(called, true);
  assert.equal(await res.text(), 'ok');
});

test('middleware: 401 login_required without a token when Access is configured', async () => {
  let called = false;
  const res = await onRequest({ env, request: new Request('https://x/api/filters'), next: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'login_required');
});

test('middleware: a valid token reaches the handler; unreachable certs fail closed', async () => {
  const realFetch = globalThis.fetch;
  try {
    // another team domain, so the per-isolate key cache from other tests does not apply
    const env2 = { ACCESS_TEAM_DOMAIN: 'tim-dua.cloudflareaccess.com', ACCESS_AUD: AUD };
    const token = await sign(good, claims({ iss: 'https://tim-dua.cloudflareaccess.com' }));
    const req = () => new Request('https://x/api/filters', { headers: { 'Cf-Access-Jwt-Assertion': token } });

    globalThis.fetch = async () => new Response('down', { status: 502 });
    const down = await onRequest({ env: env2, request: req(), next: async () => new Response('handler') });
    assert.equal(down.status, 503);

    let seen = null;
    globalThis.fetch = async (url) => { seen = String(url); return Response.json({ keys: [good.jwk] }); };
    const res = await onRequest({ env: env2, request: req(), next: async () => new Response('handler') });
    assert.equal(await res.text(), 'handler');
    assert.equal(seen, 'https://tim-dua.cloudflareaccess.com/cdn-cgi/access/certs');
  } finally {
    globalThis.fetch = realFetch;
  }
});
