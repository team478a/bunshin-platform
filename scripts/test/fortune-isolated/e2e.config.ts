import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

export default {
  tests: [
    process.env['BUNSHIN_FORTUNE_TEST_STAGE']?.startsWith('profile-')
      ? 'basic-profile.e2e.ts'
      : 'fortune.e2e.ts',
  ],
  workers: 1,
  actionTimeout: 45_000,
  timeout: 180_000,
  targets: [
    {
      engine: web({ viewport: { width: 390, height: 844 } }),
      app: { url: 'http://127.0.0.1:19000' },
    },
  ],
} satisfies E2EConfig;
