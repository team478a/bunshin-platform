import type { runMigrationProcess } from './migration-process.mjs';
export function runSchemaReadiness(
  environment?: NodeJS.ProcessEnv,
  execute?: typeof runMigrationProcess,
): Promise<number>;
