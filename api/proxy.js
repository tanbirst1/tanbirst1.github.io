// api/proxy.js
// Vercel Edge function — dependency-free proxy that adds Referer + Origin.
//
// Usage:
//   /api/proxy?url=https%3A%2F%2Fddn.gtxgamer.site%2Fembed%2Fk4c2vmy
//
// Security:
// - Recommended: set VERSEL_PROXY_SECRET in Vercel env and call with &s=SECRET
// - Or set ALLOWED_HOSTS comma-separated in env to restrict target domains.

export const config = {
  runtime: 'edge'
};

const FORWARDED_REFERER = 'https://multimovies.network/';
const FORWARDED_ORIGIN = 'https://multimovies.network';

function isValidUrl(u) {
  try {
    new URL(u);
    return true;
  } catch (e) {
    return false;
  }
}

function hostFromUrl(u) {
  try {
    return new URL(u).hostname;
  } catch (e) {
    return '';
  }
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('url');
  const providedSecret = searchParams.get('s') || '';

  if (!target || !isValidUrl(target)) {
    return new Response('Missing or invalid url parameter', { status: 400 });
  }

  // Optional security: ENV secret
  const SECRET = process.env.VERCEL_PROXY_SECRET || '';
  if (SECRET) {
    if (!providedSecret || providedSecret !== SECRET) {
      return new Response('Unauthorized (invalid proxy secret)', { status: 401 });
    }
  }

  // Optional host allowlist
  const allowedHostsEnv = (process.env.ALLOWED_HOSTS || '').trim();
  if (allowedHostsEnv) {
    const allowed = allowedHostsEnv.split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
    const tgtHost = hostFromUrl(target).toLowerCase();
    if (!allowed.includes(tgtHost)) {
      return new Response('Target host not allowed', { status: 403 });
    }
  }

  // Build fetch headers: copy some incoming headers but override referer/origin/user-agent
  const outgoingHeaders = new Headers();

  // Preserve some useful headers from client request (but avoid hop-by-hop headers)
  const inbound = req.headers;
  const preserve = ['accept', 'accept-language', 'range', 'if-range', 'cache-control'];
  for (const name of preserve) {
    const v = inbound.get(name);
    if (v) outgoingHeaders.set(name, v);
  }

  // Add spoofed Referer/Origin/User-Agent
  outgoingHeaders.set('referer', FORWARDED_REFERER);
  outgoingHeaders.set('origin', FORWARDED_ORIGIN);

  // Use a common browser UA; you may change or remove if target blocks specific UA
  const ua = inbound.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
  outgoingHeaders.set('user-agent', ua);

  // Forward cookies optionally? Uncomment if you want to forward cookies from client:
  // const cookie = inbound.get('cookie'); if (cookie) outgoingHeaders.set('cookie', cookie);

  // Request method: GET only for safety
  const method = 'GET';

  // Fetch the target
  let upstreamRes;
  try {
    upstreamRes = await fetch(target, {
      method,
      headers: outgoingHeaders,
      // you can set redirect: 'follow' (default) — keep it allowed
      redirect: 'follow'
    });
  } catch (err) {
    return new Response('Error fetching target: ' + String(err), { status: 502 });
  }

  // Build response headers — copy content-type, content-length, cache-control, content-range etc.
  const responseHeaders = new Headers();
  const copyHeaderNames = [
    'content-type',
    'content-length',
    'content-disposition',
    'content-range',
    'accept-ranges',
    'cache-control',
    'expires',
    'last-modified',
    'etag'
  ];
  for (const name of copyHeaderNames) {
    const v = upstreamRes.headers.get(name);
    if (v) responseHeaders.set(name, v);
  }

  // CORS: allow your front-end to embed this iframe. Adjust origin if needed.
  // If you only embed from your own site, replace '*' with that origin.
  responseHeaders.set('access-control-allow-origin', '*');
  responseHeaders.set('access-control-allow-credentials', 'true');

  // Security header: prevent Vercel from blocking embedding? set X-Frame-Options removed.
  // We do NOT set X-Frame-Options here, so the returned content is embeddable.

  // Return streaming body
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: responseHeaders
  });
}
