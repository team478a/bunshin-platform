import type { runMigrationProcess } from './migration-process.mjs';
export function verifyReleaseReadiness(
  execute?: typeof runMigrationProcess,
  environment?: NodeJS.ProcessEnv,
): Promise<number>;
