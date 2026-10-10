import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { fileURLToPath } from 'node:url';

export default {
  tests: ['learning.e2e.ts', 'internal-preparation.e2e.ts', 'definition-review.e2e.ts'],
  workers: 1,
  actionTimeout: 10_000,
  timeout: 60_000,
  targets: [
    {
      engine: web({ viewport: { width: 390, height: 844 } }),
      app: {
        url: 'http://127.0.0.1:4178',
        command: {
          executable: process.execPath,
          args: [
            fileURLToPath(new URL('../../../node_modules/vite/bin/vite.js', import.meta.url)),
            '--config',
            'vite.config.ts',
          ],
          log: '.e2e/logs/learning-ui.log',
        },
      },
    },
  ],
} satisfies E2EConfig;
