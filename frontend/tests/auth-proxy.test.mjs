import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { onRequest, rewriteSetCookieHeader } from '../functions/api/auth/[[path]].ts';
import viteConfigFactory from '../vite.config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '..');
const MOCK_AUTH_URL = 'https://mock.neonauth.aws.neon.tech/neondb/auth';
const PROD_ORIGIN = 'https://ajofun.pages.dev';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function collectFilesRecursive(dir, rootDir = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursive(full, rootDir));
    } else if (entry.isFile()) {
      files.push(path.relative(rootDir, full).replace(/\\/g, '/'));
    }
  }
  return files;
}

describe('rewriteSetCookieHeader', () => {
  it('strips Domain and Partitioned while rewriting SameSite=None to SameSite=Lax', () => {
    const raw =
      '__Secure-neon-auth.session_challenge=abc123; Domain=.aws.neon.tech; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=None; Partitioned';
    const rewritten = rewriteSetCookieHeader(raw);

    assert.equal(
      rewritten,
      '__Secure-neon-auth.session_challenge=abc123; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('handles case-insensitive attributes and preserves Expires and SameSite=Strict/Lax', () => {
    const raw =
      '__Secure-neon-auth.session_token=tok999; domain=ep-test.neon.tech; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/; httponly; secure; samesite=none; partitioned';
    const rewritten = rewriteSetCookieHeader(raw);

    assert.ok(rewritten.startsWith('__Secure-neon-auth.session_token=tok999;'));
    assert.ok(!/\bdomain=/i.test(rewritten));
    assert.ok(!/\bpartitioned\b/i.test(rewritten));
    assert.ok(/\bSameSite=Lax\b/.test(rewritten));
    assert.ok(/\bsecure\b/i.test(rewritten));
    assert.ok(/\bhttponly\b/i.test(rewritten));
    assert.ok(rewritten.includes('Path=/'));
    assert.ok(rewritten.includes('Expires=Wed, 21 Oct 2026 07:28:00 GMT'));

    const strictCookie = '__Secure-test=1; Path=/; HttpOnly; Secure; SameSite=Strict';
    assert.equal(rewriteSetCookieHeader(strictCookie), strictCookie);

    const laxCookie = '__Secure-test=2; Path=/; HttpOnly; Secure; SameSite=Lax';
    assert.equal(rewriteSetCookieHeader(laxCookie), laxCookie);
  });
});

describe('onRequest security and routing guards', () => {
  it('returns 500 when NEON_AUTH_URL and VITE_NEON_AUTH_URL are missing', async () => {
    const res = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/get-session`),
      env: {},
      params: { path: ['get-session'] },
    });

    assert.equal(res.status, 500);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  it('returns 500 for non-HTTPS upstream URLs', async () => {
    const res = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/get-session`),
      env: { NEON_AUTH_URL: 'http://insecure.example.com/neondb/auth' },
      params: { path: ['get-session'] },
    });

    assert.equal(res.status, 500);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  it('returns 500 on self-origin proxy loop', async () => {
    const res = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/get-session`),
      env: { VITE_NEON_AUTH_URL: `${PROD_ORIGIN}/api/auth` },
      params: { path: ['get-session'] },
    });

    assert.equal(res.status, 500);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  it('rejects cross-origin requests with 403', async () => {
    const res = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/get-session`, {
        headers: { Origin: 'https://evil.example' },
      }),
      env: { NEON_AUTH_URL: MOCK_AUTH_URL },
      params: { path: ['get-session'] },
    });

    assert.equal(res.status, 403);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  it('rejects path traversal payloads with 400', async () => {
    for (const badPath of ['/api/auth/../../x', '/api/auth/%2e%2e/x', '/api/auth/..%2F..%2Fx']) {
      const res = await onRequest({
        request: new Request(`${PROD_ORIGIN}${badPath}`),
        env: { NEON_AUTH_URL: MOCK_AUTH_URL },
        params: { path: ['x'] },
      });
      assert.equal(res.status, 400, `Expected 400 for ${badPath}`);
    }
  });

  it('rejects disallowed HTTP methods with 405 and allows same-origin OPTIONS with 204', async () => {
    const badRes = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/get-session`, { method: 'PROPFIND' }),
      env: { NEON_AUTH_URL: MOCK_AUTH_URL },
      params: { path: ['get-session'] },
    });
    assert.equal(badRes.status, 405);
    assert.ok(badRes.headers.get('allow')?.includes('POST'));

    const optRes = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/get-session`, {
        method: 'OPTIONS',
        headers: { Origin: PROD_ORIGIN },
      }),
      env: { NEON_AUTH_URL: MOCK_AUTH_URL },
      params: { path: ['get-session'] },
    });
    assert.equal(optRes.status, 204);
    assert.equal(optRes.headers.get('cache-control'), 'no-store');
  });

  it('returns 502 when upstream fetch rejects', async () => {
    globalThis.fetch = async () => {
      throw new Error('Upstream unavailable');
    };

    const res = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/get-session`, {
        headers: { Origin: PROD_ORIGIN },
      }),
      env: { NEON_AUTH_URL: MOCK_AUTH_URL },
      params: { path: ['get-session'] },
    });

    assert.equal(res.status, 502);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });
});

describe('onRequest proxy contract and OAuth round-trip simulation', () => {
  it('proxies social sign-in, strips internal/CORS headers, preserves JWT, and completes verifier round-trip', async () => {
    const upstreamCalls = [];

    globalThis.fetch = async (url, init = {}) => {
      const headers = new Headers(init.headers);
      let bodyText = null;
      if (init.body) {
        bodyText = await new Response(init.body).text();
      }
      upstreamCalls.push({ url: String(url), method: init.method, redirect: init.redirect, headers, bodyText });

      if (String(url).endsWith('/sign-in/social')) {
        const resHeaders = new Headers({
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': PROD_ORIGIN,
          'Access-Control-Allow-Credentials': 'true',
          'Content-Encoding': 'gzip',
          'Content-Length': '999',
        });
        resHeaders.append(
          'Set-Cookie',
          '__Secure-neon-auth.session_challenge=challenge_xyz; Domain=.aws.neon.tech; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=None; Partitioned',
        );
        resHeaders.append(
          'Set-Cookie',
          '__Secure-neon-auth.session_challange=challenge_xyz; Domain=.aws.neon.tech; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=None; Partitioned',
        );
        return new Response(
          JSON.stringify({
            url: 'https://mock.neonauth.aws.neon.tech/neondb/auth/sign-in/social/init?token=oauth_tok',
            redirect: false,
          }),
          { status: 200, headers: resHeaders },
        );
      }

      if (String(url).includes('/get-session?neon_auth_session_verifier=valid_token')) {
        const sentCookies = headers.get('cookie') || '';
        assert.ok(sentCookies.includes('__Secure-neon-auth.session_challenge=challenge_xyz'));

        const resHeaders = new Headers({
          'Content-Type': 'application/json; charset=utf-8',
          'set-auth-jwt': 'hdr.payload.sig_oauth_jwt',
          'Cache-Control': 'no-store',
        });
        resHeaders.append(
          'Set-Cookie',
          '__Secure-neon-auth.session_token=session_live_123; Domain=.aws.neon.tech; Path=/; HttpOnly; Secure; SameSite=None; Partitioned',
        );
        return new Response(
          JSON.stringify({
            user: { id: 'user-1', email: 'alex@example.com', name: 'Alex', emailVerified: true },
            session: { token: 'session_live_123' },
          }),
          { status: 200, headers: resHeaders },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    // Step 1: Initiate Google OAuth via same-origin proxy
    const socialRes = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: {
          Origin: PROD_ORIGIN,
          'Content-Type': 'application/json',
          'cf-connecting-ip': '203.0.113.10',
          'cf-ray': 'abc123',
          'x-forwarded-host': 'ajofun.pages.dev',
          host: 'ajofun.pages.dev',
        },
        body: JSON.stringify({
          provider: 'google',
          callbackURL: `${PROD_ORIGIN}/`,
          disableRedirect: true,
        }),
      }),
      env: { NEON_AUTH_URL: MOCK_AUTH_URL },
      params: { path: ['sign-in', 'social'] },
    });

    assert.equal(socialRes.status, 200);
    assert.equal(socialRes.headers.get('access-control-allow-origin'), null);
    assert.equal(socialRes.headers.get('content-encoding'), null);
    assert.equal(socialRes.headers.get('content-length'), null);
    assert.equal(socialRes.headers.get('cache-control'), 'no-store');

    const call1 = upstreamCalls[0];
    assert.equal(call1.url, `${MOCK_AUTH_URL}/sign-in/social`);
    assert.equal(call1.method, 'POST');
    assert.equal(call1.redirect, 'manual');
    assert.equal(call1.headers.get('origin'), PROD_ORIGIN);
    assert.equal(call1.headers.get('cf-connecting-ip'), null);
    assert.equal(call1.headers.get('cf-ray'), null);
    assert.equal(call1.headers.get('x-forwarded-host'), null);
    assert.equal(call1.headers.get('host'), null);
    assert.deepEqual(JSON.parse(call1.bodyText), {
      provider: 'google',
      callbackURL: `${PROD_ORIGIN}/`,
      disableRedirect: true,
    });

    const socialCookies = socialRes.headers.getSetCookie();
    assert.equal(socialCookies.length, 2);
    for (const cookie of socialCookies) {
      assert.ok(cookie.includes('SameSite=Lax'));
      assert.ok(cookie.includes('Secure'));
      assert.ok(cookie.includes('HttpOnly'));
      assert.ok(!/\bdomain=/i.test(cookie));
      assert.ok(!/\bpartitioned\b/i.test(cookie));
    }

    // Step 2: Simulate browser returning from Google/Neon with verifier & sending first-party cookies
    const browserCookieHeader = socialCookies.map((c) => c.split(';')[0]).join('; ');
    const verifyRes = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/get-session?neon_auth_session_verifier=valid_token`, {
        method: 'GET',
        headers: {
          Origin: PROD_ORIGIN,
          Cookie: browserCookieHeader,
        },
      }),
      env: { NEON_AUTH_URL: MOCK_AUTH_URL },
      params: { path: ['get-session'] },
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.headers.get('set-auth-jwt'), 'hdr.payload.sig_oauth_jwt');
    const sessionCookies = verifyRes.headers.getSetCookie();
    assert.equal(sessionCookies.length, 1);
    assert.ok(sessionCookies[0].startsWith('__Secure-neon-auth.session_token=session_live_123;'));
    assert.ok(sessionCookies[0].includes('SameSite=Lax'));
    assert.ok(!/\bdomain=/i.test(sessionCookies[0]));
    assert.ok(!/\bpartitioned\b/i.test(sessionCookies[0]));

    const verifyPayload = await verifyRes.json();
    assert.equal(verifyPayload.user.email, 'alex@example.com');
  });

  it('proxies email sign-in, token refresh, and sign-out cleanly', async () => {
    globalThis.fetch = async (url, init = {}) => {
      const target = String(url);
      if (target.endsWith('/sign-in/email')) {
        assert.equal(init.method, 'POST');
        const resHeaders = new Headers({
          'Content-Type': 'application/json',
          'set-auth-jwt': 'hdr.payload.email_jwt',
        });
        resHeaders.append(
          'Set-Cookie',
          '__Secure-neon-auth.session_token=sess_email; Path=/; HttpOnly; Secure; SameSite=None; Partitioned',
        );
        return new Response(
          JSON.stringify({ user: { id: 'u-email', email: 'u@example.com', emailVerified: true } }),
          { status: 200, headers: resHeaders },
        );
      }
      if (target.endsWith('/token')) {
        assert.equal(init.method, 'GET');
        assert.ok(new Headers(init.headers).get('cookie')?.includes('session_token=sess_email'));
        return new Response(JSON.stringify({ token: 'hdr.payload.refreshed_jwt' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'set-auth-jwt': 'hdr.payload.refreshed_jwt' },
        });
      }
      if (target.endsWith('/sign-out')) {
        assert.equal(init.method, 'POST');
        const resHeaders = new Headers({ 'Content-Type': 'application/json' });
        resHeaders.append(
          'Set-Cookie',
          '__Secure-neon-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None',
        );
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: resHeaders });
      }
      throw new Error(`Unexpected URL: ${target}`);
    };

    const emailRes = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { Origin: PROD_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'u@example.com', password: 'password123' }),
      }),
      env: { NEON_AUTH_URL: MOCK_AUTH_URL },
      params: { path: ['sign-in', 'email'] },
    });
    assert.equal(emailRes.status, 200);
    assert.equal(emailRes.headers.get('set-auth-jwt'), 'hdr.payload.email_jwt');
    const cookiePair = emailRes.headers.getSetCookie()[0].split(';')[0];

    const tokenRes = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/token`, {
        method: 'GET',
        headers: { Origin: PROD_ORIGIN, Cookie: cookiePair },
      }),
      env: { NEON_AUTH_URL: MOCK_AUTH_URL },
      params: { path: ['token'] },
    });
    assert.equal(tokenRes.status, 200);
    assert.equal(tokenRes.headers.get('set-auth-jwt'), 'hdr.payload.refreshed_jwt');

    const signOutRes = await onRequest({
      request: new Request(`${PROD_ORIGIN}/api/auth/sign-out`, {
        method: 'POST',
        headers: { Origin: PROD_ORIGIN, Cookie: cookiePair, 'Content-Type': 'application/json' },
        body: '{}',
      }),
      env: { NEON_AUTH_URL: MOCK_AUTH_URL },
      params: { path: ['sign-out'] },
    });
    assert.equal(signOutRes.status, 200);
    assert.ok(signOutRes.headers.getSetCookie()[0].includes('SameSite=Lax'));
  });
});

describe('production configuration invariants', () => {
  it('registers /api/auth before /api in Vite server and preview proxies', () => {
    const prevNeonAuthUrl = process.env.NEON_AUTH_URL;
    process.env.NEON_AUTH_URL = MOCK_AUTH_URL;
    try {
      const resolved = viteConfigFactory({ mode: 'development', command: 'serve' });
      const serverProxyKeys = Object.keys(resolved.server?.proxy ?? {});
      const previewProxyKeys = Object.keys(resolved.preview?.proxy ?? {});

      for (const keys of [serverProxyKeys, previewProxyKeys]) {
        const authIndex = keys.indexOf('/api/auth');
        const apiIndex = keys.indexOf('/api');
        assert.notEqual(authIndex, -1, 'Expected /api/auth proxy entry');
        assert.notEqual(apiIndex, -1, 'Expected /api proxy entry');
        assert.ok(authIndex < apiIndex, 'Expected /api/auth to be registered before /api');
      }
    } finally {
      if (prevNeonAuthUrl === undefined) {
        delete process.env.NEON_AUTH_URL;
      } else {
        process.env.NEON_AUTH_URL = prevNeonAuthUrl;
      }
    }
  });

  it('keeps connect-src self allowed in _headers CSP', () => {
    const headersFile = fs.readFileSync(path.join(FRONTEND_DIR, 'public/_headers'), 'utf8');
    assert.match(headersFile, /connect-src[^;]*'self'/i);
  });

  it('exposes only the expected Pages Function route under frontend/functions', () => {
    const functionsDir = path.join(FRONTEND_DIR, 'functions');
    const files = collectFilesRecursive(functionsDir);
    assert.deepEqual(files, ['api/auth/[[path]].ts']);
  });
});
