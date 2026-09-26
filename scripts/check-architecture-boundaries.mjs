import path from 'node:path';
import process from 'node:process';

import { checkRepository } from './architecture-boundaries.mjs';

const repoRoot = path.resolve(process.cwd());
const violations = checkRepository(repoRoot);

if (violations.length === 0) {
  console.log('Architecture boundary check passed.');
  process.exit(0);
}

console.error(`Architecture boundary check failed with ${violations.length} violation(s):`);
for (const item of violations) {
  const relativePath = path.relative(repoRoot, item.filePath).replaceAll('\\', '/');
  console.error(
    `${relativePath}:${item.line}:${item.column} [${item.code}] ${item.message} (${item.referenceKind}: ${item.specifier})`,
  );
}
process.exit(1);
