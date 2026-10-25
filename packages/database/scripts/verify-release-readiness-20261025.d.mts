import type { runMigrationProcess } from './migration-process.mjs';

export function verifyReleaseReadiness20261025(
  execute?: typeof runMigrationProcess,
  environment?: NodeJS.ProcessEnv,
): Promise<number>;
