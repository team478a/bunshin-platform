import type { NextConfig } from 'next';
import { join } from 'node:path';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  outputFileTracingRoot: join(process.cwd(), '../..'),
  outputFileTracingIncludes: {
    '/api/admin/groups/*/line-rich-menu/default': [
      '../../node_modules/.pnpm/harfbuzzjs@*/node_modules/harfbuzzjs/hb.wasm',
    ],
    '/api/admin/line-rich-menus/default': [
      '../../node_modules/.pnpm/harfbuzzjs@*/node_modules/harfbuzzjs/hb.wasm',
    ],
    '/api/internal/jobs/run': [
      '../../node_modules/.pnpm/harfbuzzjs@*/node_modules/harfbuzzjs/hb.wasm',
    ],
  },
  // Satori loads harfbuzzjs asynchronously and resolves hb.wasm from its own
  // package directory. Keeping both packages external preserves that runtime
  // directory instead of baking Vercel's build path (/ROOT) into the bundle.
  serverExternalPackages: ['@prisma/client', '@resvg/resvg-js', 'harfbuzzjs', 'satori'],
  transpilePackages: [
    '@bunshin/application',
    '@bunshin/config',
    '@bunshin/database',
    '@bunshin/observability',
    '@bunshin/shared',
  ],
  headers() {
    return Promise.resolve([{ source: '/(.*)', headers: securityHeaders }]);
  },
  redirects() {
    return Promise.resolve([
      {
        source: '/groups/:groupId/videos/:videoProjectId',
        destination: '/video-access/:videoProjectId',
        missing: [{ type: 'query' as const, key: 'manage' }],
        permanent: false,
      },
    ]);
  },
};

export default config;
