export type MigrationHistoryStatus =
  | { status: 'UP_TO_DATE'; pendingMigrations: [] }
  | { status: 'PENDING'; pendingMigrations: string[] }
  | { status: 'NEEDS_REVIEW' | 'UNKNOWN'; pendingMigrations: string[] };

export function parseMigrationHistoryStatus(
  output: string,
  names?: string[],
): MigrationHistoryStatus;
