interface Env {
  NEON_AUTH_URL?: string;
  VITE_NEON_AUTH_URL?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: {
    path?: string | string[];
  };
}

interface ProxyRequestInit extends RequestInit {
  duplex?: 'half';
}

const AUTH_PREFIX = '/api/auth';
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'cookie',
  'referer',
  'user-agent',
] as const;
const STRIPPED_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-expose-headers',
]);

function jsonError(
  status: number,
  message: string,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

/**
 * Rewrites upstream Set-Cookie attributes so Neon Auth cookies are stored as
 * first-party host-only cookies on the application origin.
 */
export function rewriteSetCookieHeader(cookie: string): string {
  const parts = cookie
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return cookie;
  }

  const [nameValue, ...attributes] = parts;
  const rewrittenAttributes: string[] = [];

  for (const attr of attributes) {
    const eqIndex = attr.indexOf('=');
    const attrName = (eqIndex === -1 ? attr : attr.slice(0, eqIndex)).trim().toLowerCase();
    const attrValue = eqIndex === -1 ? '' : attr.slice(eqIndex + 1).trim().toLowerCase();

    if (attrName === 'domain' || attrName === 'partitioned') {
      continue;
    }
    if (attrName === 'samesite' && attrValue === 'none') {
      rewrittenAttributes.push('SameSite=Lax');
      continue;
    }
    rewrittenAttributes.push(attr);
  }

  return [nameValue, ...rewrittenAttributes].join('; ');
}

function extractSetCookieHeaders(headers: Headers): string[] {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const raw = headers.get('set-cookie');
  if (!raw) {
    return [];
  }
  return raw
    .split(/,(?=\s*[^;=,\s]+=)/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Proxies same-origin /api/auth/* requests to Neon Auth while keeping cookies
 * strictly first-party on the Pages origin.
 */
export async function onRequest(context: PagesContext): Promise<Response> {
  const incomingUrl = new URL(context.request.url);
  const requestOrigin = context.request.headers.get('origin');

  if (requestOrigin !== null && requestOrigin !== incomingUrl.origin) {
    return jsonError(403, 'Cross-origin auth requests are not allowed.');
  }

  const method = context.request.method.toUpperCase();
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  if (!ALLOWED_METHODS.has(method)) {
    return jsonError(405, 'Method not allowed.', {
      Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    });
  }

  const rawBase = (context.env.NEON_AUTH_URL || context.env.VITE_NEON_AUTH_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!rawBase) {
    return jsonError(500, 'Neon Auth proxy is not configured.');
  }

  let upstreamBaseUrl: URL;
  try {
    upstreamBaseUrl = new URL(rawBase);
  } catch {
    return jsonError(500, 'Neon Auth upstream URL is invalid.');
  }

  if (upstreamBaseUrl.protocol !== 'https:' || upstreamBaseUrl.origin === incomingUrl.origin) {
    return jsonError(500, 'Neon Auth upstream URL configuration is invalid.');
  }

  if (
    incomingUrl.pathname !== AUTH_PREFIX &&
    !incomingUrl.pathname.startsWith(`${AUTH_PREFIX}/`)
  ) {
    return jsonError(400, 'Invalid auth proxy path.');
  }

  const subPath = incomingUrl.pathname.slice(AUTH_PREFIX.length);
  if (subPath && !subPath.startsWith('/')) {
    return jsonError(400, 'Invalid auth proxy path.');
  }

  let decodedSubPath: string;
  try {
    decodedSubPath = decodeURIComponent(subPath);
  } catch {
    return jsonError(400, 'Invalid auth proxy path.');
  }
  if (/(?:^|\/)\.\.?(?:\/|$)/.test(decodedSubPath) || decodedSubPath.includes('\\')) {
    return jsonError(400, 'Invalid auth proxy path.');
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(`${rawBase}${subPath}${incomingUrl.search}`);
  } catch {
    return jsonError(400, 'Invalid auth proxy target.');
  }

  const normalizedBasePath = upstreamBaseUrl.pathname.replace(/\/+$/, '');
  const withinBasePath = normalizedBasePath
    ? parsedTarget.pathname === normalizedBasePath ||
      parsedTarget.pathname.startsWith(`${normalizedBasePath}/`)
    : parsedTarget.pathname.startsWith('/');

  if (parsedTarget.origin !== upstreamBaseUrl.origin || !withinBasePath) {
    return jsonError(400, 'Invalid auth proxy path.');
  }

  const upstreamHeaders = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = context.request.headers.get(name);
    if (value !== null) {
      upstreamHeaders.set(name, value);
    }
  }
  // Better Auth checks Origin against trusted domains; Host stays on the Neon upstream origin.
  upstreamHeaders.set('origin', requestOrigin || incomingUrl.origin);

  const requestInit: ProxyRequestInit = {
    method,
    headers: upstreamHeaders,
    redirect: 'manual',
  };
  if (method !== 'GET' && method !== 'HEAD' && context.request.body !== null) {
    requestInit.body = context.request.body;
    requestInit.duplex = 'half';
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(parsedTarget.toString(), requestInit);
  } catch {
    return jsonError(502, 'Unable to reach authentication service.');
  }

  const responseHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.append(key, value);
    }
  });
  if (!responseHeaders.has('cache-control')) {
    responseHeaders.set('Cache-Control', 'no-store');
  }
  for (const cookie of extractSetCookieHeaders(upstreamRes.headers)) {
    responseHeaders.append('Set-Cookie', rewriteSetCookieHeader(cookie));
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: responseHeaders,
  });
}
