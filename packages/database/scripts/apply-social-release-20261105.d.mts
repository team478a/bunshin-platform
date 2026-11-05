import type { runMigrationProcess } from './migration-process.mjs';

export function runSocialRelease20261105Migration(
  execute?: typeof runMigrationProcess,
  environment?: NodeJS.ProcessEnv,
): Promise<number>;
