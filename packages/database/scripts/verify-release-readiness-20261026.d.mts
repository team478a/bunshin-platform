import type { runMigrationProcess } from './migration-process.mjs';

export function verifyReleaseReadiness20261026(
  execute?: typeof runMigrationProcess,
  environment?: NodeJS.ProcessEnv,
): Promise<number>;
