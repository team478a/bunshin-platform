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
export function withMigrationConnectionMetadata(directUrl: string): string;
export function assertReleaseMigrationGuard(): string[];
export function buildReleasePreflightSql(expectedMigrationNames: string[]): string;
export function runVercelMigration(
  environment?: NodeJS.ProcessEnv,
  execute?: typeof import('./migration-process.mjs').runMigrationProcess,
): Promise<number>;
