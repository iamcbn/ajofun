import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

function rewriteSetCookieForFirstParty(cookie: string): string {
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

function createProxyConfig(rawNeonAuthUrl: string): Record<string, ProxyOptions> {
  const proxy: Record<string, ProxyOptions> = {};
  const trimmed = rawNeonAuthUrl.trim();

  if (trimmed) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        const basePath = parsed.pathname.replace(/\/+$/, '');
        proxy['/api/auth'] = {
          target: parsed.origin,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => `${basePath}${path.replace(/^\/api\/auth/, '')}` || '/',
          configure: (httpProxy) => {
            httpProxy.on('proxyRes', (proxyRes) => {
              const setCookie = proxyRes.headers['set-cookie'];
              if (Array.isArray(setCookie)) {
                proxyRes.headers['set-cookie'] = setCookie.map(rewriteSetCookieForFirstParty);
              }
            });
          },
        };
      }
    } catch {
      // Ignore non-absolute auth URLs (for example, "/api/auth")
    }
  }

  proxy['/api'] = {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
  };

  return proxy;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = createProxyConfig(env.NEON_AUTH_URL || env.VITE_NEON_AUTH_URL || '');

  return {
    plugins: [react()],
    define: {
      __LOCAL_DEBUG__: JSON.stringify(mode === 'debug'),
    },
    server: {
      allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io'],
      proxy,
    },
    preview: {
      proxy,
    },
  };
});
