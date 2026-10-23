import type { runMigrationProcess } from './migration-process.mjs';
export function diagnoseReleaseAuth(
  execute?: typeof runMigrationProcess,
  environment?: NodeJS.ProcessEnv,
): Promise<number>;
