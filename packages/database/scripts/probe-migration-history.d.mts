export type MigrationHistoryStatus = {
  status: 'PENDING' | 'UP_TO_DATE' | 'NEEDS_REVIEW' | 'UNKNOWN';
  pendingMigrations: string[];
};
export function parseMigrationHistoryStatus(
  output: string,
  names?: string[],
): MigrationHistoryStatus;
export function runMigrationHistoryProbe(
  environment?: NodeJS.ProcessEnv,
  execute?: typeof import('./migration-process.mjs').runMigrationProcess,
): Promise<number>;
