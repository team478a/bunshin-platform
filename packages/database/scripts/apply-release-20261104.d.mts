import type { runMigrationProcess } from './migration-process.mjs';

export function runRelease20261104Migration(
  execute?: typeof runMigrationProcess,
  environment?: NodeJS.ProcessEnv,
): Promise<number>;
