import { json } from './_supabase.js';
import { accessConfig, verifyAccessJwt, jwksFetcher } from './_access.js';

// Runs before every /api/* handler: when Cloudflare Access is configured
// (ACCESS_TEAM_DOMAIN + ACCESS_AUD), only requests with a valid Access login
// for an allowed work email get through. See _access.js.
export async function onRequest(context) {
  const cfg = accessConfig(context.env);
  if (!cfg) return context.next();

  const token = context.request.headers.get('Cf-Access-Jwt-Assertion');
  let result;
  try {
    result = await verifyAccessJwt(token, cfg, jwksFetcher(cfg.certsUrl));
  } catch (err) {
    // the team's public keys could not be fetched: refuse rather than let it through
    return json({ error: 'login_check_failed', detail: err.message }, 503);
  }
  if (!result.ok) return json({ error: 'login_required', reason: result.reason }, 401);
  return context.next();
}
