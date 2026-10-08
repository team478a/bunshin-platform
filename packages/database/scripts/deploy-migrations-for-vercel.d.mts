export function resolveMigrationDirectUrl(
  directUrl: string,
  sessionPoolerHost: string | undefined,
): string;

export type MigrationBounds = {
  lockTimeoutMs: number;
  statementTimeoutMs: number;
  processTimeoutMs: number;
};
export function resolveMigrationBounds(environment: NodeJS.ProcessEnv): MigrationBounds;
export function withMigrationBounds(directUrl: string, bounds: MigrationBounds): string;
export function runVercelMigration(
  environment?: NodeJS.ProcessEnv,
  execute?: typeof import('./migration-process.mjs').runMigrationProcess,
): Promise<number>;
export function runMigrationConnectionProbe(
  environment?: NodeJS.ProcessEnv,
  execute?: typeof import('./migration-process.mjs').runMigrationProcess,
): Promise<number>;
