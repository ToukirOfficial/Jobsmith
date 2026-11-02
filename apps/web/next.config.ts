import path from 'node:path';
import type { NextConfig } from 'next';

const apiUrl = process.env['API_INTERNAL_URL'] ?? 'http://127.0.0.1:8135';
const isDev = process.env['NODE_ENV'] === 'development';

/** CSP without nonces so pages stay static: only our own scripts, styles, fonts, images and API. */
const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval': the CV preview's layout engine (yoga, in react-pdf) is WebAssembly.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  transpilePackages: ['@jobsmith/shared', '@jobsmith/pdf'],
  // The browser only ever talks to this origin; Next.js forwards /api/* to NestJS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/((?!api/).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
