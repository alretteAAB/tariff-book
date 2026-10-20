// Client for the golongan operasi project: a separate Supabase project with
// the surgery classification reference (sql/golongan/*). Not a tarif shard.
// Env (Cloudflare Pages, Production + Preview): GOLONGAN_URL, GOLONGAN_KEY.
import { createClient } from '@supabase/supabase-js';

let cached = null;
export function golonganClient(env) {
  if (!env.GOLONGAN_URL || !env.GOLONGAN_KEY) {
    throw new Error('GOLONGAN_URL / GOLONGAN_KEY not set for this Cloudflare environment (Production and Preview are separate)');
  }
  const key = `${env.GOLONGAN_URL}|${env.GOLONGAN_KEY}`;
  if (cached?.key !== key) {
    cached = { key, client: createClient(env.GOLONGAN_URL, env.GOLONGAN_KEY, { auth: { persistSession: false } }) };
  }
  return cached.client;
}
