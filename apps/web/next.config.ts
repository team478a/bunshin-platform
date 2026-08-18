import type { NextConfig } from 'next';

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
  serverExternalPackages: ['@prisma/client'],
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
};

export default config;
