import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  publicDir: path.resolve(root, '../../../apps/web/public'),
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      react: path.resolve(root, '../../../apps/web/node_modules/react'),
      'react-dom': path.resolve(root, '../../../apps/web/node_modules/react-dom'),
      'next/navigation': path.resolve(root, 'fortune-navigation-fixture.tsx'),
      'next/link': path.resolve(root, 'fortune-navigation-fixture.tsx'),
    },
  },
  server: { host: '127.0.0.1', port: 4178, strictPort: true, watch: { ignored: ['**/.e2e/**'] } },
});
