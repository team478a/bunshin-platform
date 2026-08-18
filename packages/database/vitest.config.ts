import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const requireModule = createRequire(import.meta.url);
const prismaPackageEntry = requireModule.resolve('@prisma/client/index');
const generatedPrismaEntry = resolve(dirname(prismaPackageEntry), '../../.prisma/client/index.js');

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@prisma\/client$/, replacement: generatedPrismaEntry },
      { find: '@prisma/client/index', replacement: generatedPrismaEntry },
    ],
  },
  test: { environment: 'node' },
});
