// api/proxy.js
// Vercel Edge function — dependency-free proxy that spoofs Referer/Origin
// and rewrites redirect Location headers so redirects pass through the proxy.
//
// Usage:
//   /api/proxy?url=<ENCODED_TARGET_URL>[&s=SECRET]
//
// Environment (recommended):
//   VERCEL_PROXY_SECRET  -> secret string to require on requests (optional)
//   ALLOWED_HOSTS        -> comma-separated hostnames allowed (optional)
//   FORWARD_REFERER      -> override default referer (optional)
//   FORWARD_ORIGIN       -> override default origin (optional)

export const config = { runtime: 'edge' };

const DEFAULT_REFERER = 'https://multimovies.network/';
const DEFAULT_ORIGIN = 'https://multimovies.network';

function isValidUrl(u) {
  try {
    new URL(u);
    return true;
  } catch (e) {
    return false;
  }
}

function absoluteLocation(location, base) {
  try {
    return new URL(location, base).href;
  } catch (e) {
    return location;
  }
}

export default async function handler(req) {
  const urlObj = new URL(req.url);
  const sp = urlObj.searchParams;
  const target = sp.get('url') || '';
  const providedSecret = sp.get('s') || '';

  if (!target || !isValidUrl(target)) {
    return new Response('Missing or invalid url parameter', { status: 400 });
  }

  // Optional secret enforcement
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
    const tgtHost = (() => { try { return new URL(target).hostname.toLowerCase(); } catch { return ''; } })();
    if (!allowed.includes(tgtHost)) {
      return new Response('Target host not allowed', { status: 403 });
    }
  }

  // Build outgoing headers: copy a safe subset from incoming request
  const incoming = req.headers;
  const outgoing = new Headers();

  // Preserve headers that help with video streaming/partial requests
  const preserve = ['accept', 'accept-language', 'range', 'if-range', 'if-none-match', 'if-modified-since', 'cache-control'];
  for (const name of preserve) {
    const v = incoming.get(name);
    if (v) outgoing.set(name, v);
  }

  // Set spoofed referer/origin and a browser-like UA
  const FORWARDED_REFERER = process.env.FORWARD_REFERER || DEFAULT_REFERER;
  const FORWARDED_ORIGIN = process.env.FORWARD_ORIGIN || DEFAULT_ORIGIN;
  outgoing.set('referer', FORWARDED_REFERER);
  outgoing.set('origin', FORWARDED_ORIGIN);

  const ua = incoming.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
  outgoing.set('user-agent', ua);

  // Forward cookies optionally (uncomment if you need)
  // const cookie = incoming.get('cookie'); if (cookie) outgoing.set('cookie', cookie);

  // Important: we intentionally set redirect:'manual' so we can rewrite Location headers.
  let upstreamRes;
  try {
    upstreamRes = await fetch(target, {
      method: 'GET',
      headers: outgoing,
      redirect: 'manual' // capture 3xx and rewrite
    });
  } catch (err) {
    return new Response('Error fetching target: ' + String(err), { status: 502 });
  }

  // If upstream returned a redirect, rewrite Location so browser follows via this proxy.
  if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
    const loc = upstreamRes.headers.get('location');
    const absoluteLoc = loc ? absoluteLocation(loc, target) : null;

    // Build proxied Location that points back to this API and encodes the real location.
    const hostOrigin = `${urlObj.protocol}//${urlObj.host}`; // e.g. https://your-deploy.vercel.app
    const secretParam = SECRET ? `&s=${encodeURIComponent(SECRET)}` : '';
    const proxied = absoluteLoc ? `${hostOrigin}/api/proxy?url=${encodeURIComponent(absoluteLoc)}${secretParam}` : null;

    const responseHeaders = new Headers();
    // Copy useful headers from upstream (cache-related might be helpful)
    const copyHeaderNames = ['content-type', 'cache-control', 'expires', 'pragma', 'etag'];
    for (const name of copyHeaderNames) {
      const v = upstreamRes.headers.get(name);
      if (v) responseHeaders.set(name, v);
    }

    // Set rewritten Location if we have one
    if (proxied) {
      responseHeaders.set('location', proxied);
    } else if (loc) {
      // fallback: pass original location
      responseHeaders.set('location', loc);
    }

    // CORS so front-end can embed/follow redirects
    responseHeaders.set('access-control-allow-origin', '*');
    responseHeaders.set('access-control-allow-credentials', 'true');

    // Return the redirect status and headers (body typically empty)
    return new Response(null, {
      status: upstreamRes.status,
      headers: responseHeaders
    });
  }

  // Non-redirect: stream body back to client and copy relevant headers
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

  // Allow embedding & CORS (adjust origin instead of '*' for more safety)
  responseHeaders.set('access-control-allow-origin', '*');
  responseHeaders.set('access-control-allow-credentials', 'true');

  // Return the upstream response body (streaming)
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: responseHeaders
  });
}
