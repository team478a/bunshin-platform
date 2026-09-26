import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { analyzeSourceFile } from '../architecture-boundaries.mjs';

const repoRoot = path.resolve('/virtual/bunshin-platform');
const packages = [
  ['@bunshin/platform-domain', 'platform-domain'],
  ['@bunshin/shared', 'shared'],
  ['@bunshin/capability-contract', 'capability-contract'],
  ['@bunshin/application', 'application'],
  ['@bunshin/database', 'database'],
].map(([name, directory]) => ({
  name,
  root: path.join(repoRoot, 'packages', directory),
  exports: new Set(['.']),
}));

function analyze(relativePath, sourceText) {
  return analyzeSourceFile({
    repoRoot,
    filePath: path.join(repoRoot, relativePath),
    sourceText,
    packages,
  });
}

test('allows an application import through an approved public package entry', () => {
  assert.deepEqual(
    analyze('packages/application/src/use-case.ts', "import { ok } from '@bunshin/shared';"),
    [],
  );
});

test('rejects a forbidden static application import', () => {
  const violations = analyze(
    'packages/application/src/use-case.ts',
    "import { prisma } from '@bunshin/database';",
  );
  assert.ok(violations.some((item) => item.code === 'APPLICATION_DEPENDENCY_DIRECTION'));
});

test('rejects a forbidden re-export from a core package', () => {
  const violations = analyze(
    'packages/platform-domain/src/index.ts',
    "export { prisma } from '@bunshin/database';",
  );
  assert.ok(violations.some((item) => item.code === 'CORE_DEPENDENCY_DIRECTION'));
});

test('rejects a relative path that crosses package boundaries', () => {
  const violations = analyze(
    'packages/application/src/use-case.ts',
    "import { value } from '../../shared/src/index.ts';",
  );
  assert.ok(violations.some((item) => item.code === 'CROSS_PACKAGE_RELATIVE'));
});

test('rejects a forbidden dynamic import', () => {
  const violations = analyze(
    'packages/application/src/use-case.ts',
    "const database = await import('@bunshin/database');",
  );
  assert.ok(violations.some((item) => item.code === 'APPLICATION_DEPENDENCY_DIRECTION'));
});

test('rejects a package source subpath that bypasses declared exports', () => {
  const violations = analyze(
    'packages/application/src/use-case.ts',
    "import type { User } from '@bunshin/platform-domain/src/user.ts';",
  );
  assert.ok(violations.some((item) => item.code === 'PUBLIC_ENTRY_BYPASS'));
});

test('allows a type import through the published entry', () => {
  assert.deepEqual(
    analyze(
      'packages/application/src/use-case.ts',
      "import type { User } from '@bunshin/platform-domain';",
    ),
    [],
  );
});

test('allows database composition from the documented web composition root', () => {
  assert.deepEqual(
    analyze('apps/web/src/composition.ts', "import { repositories } from '@bunshin/database';"),
    [],
  );
});

test('allows database adapters to implement application ports', () => {
  assert.deepEqual(
    analyze(
      'packages/database/src/repository.ts',
      "import type { RepositoryPort } from '@bunshin/application';",
    ),
    [],
  );
});
