import { getClient, json } from './_supabase.js';

export async function onRequestGet({ env }) {
  const supabase = getClient(env);
  const { data, error } = await supabase.rpc('get_filters');
  if (error) return json({ error: error.message }, 500);
  return json(data);
}
