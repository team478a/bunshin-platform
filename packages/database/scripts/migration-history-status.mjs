import { readdirSync } from 'node:fs';

const migrationDirectory = new URL('../prisma/migrations/', import.meta.url);
const migrationNamePattern = /^\d{14}_[a-z0-9_]+$/;

function knownMigrations() {
  return readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && migrationNamePattern.test(entry.name))
    .map((entry) => entry.name);
}

export function parseMigrationHistoryStatus(output, names = knownMigrations()) {
  const text = String(output);
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const known = new Set(names);
  const pendingHeading = /migration(?:\(s\)|s)? have not yet been applied/i;
  const pendingStart = lines.findIndex((line) => pendingHeading.test(line));
  const pendingNames = [];

  if (pendingStart >= 0) {
    for (const line of lines.slice(pendingStart + 1)) {
      if (!line) {
        if (pendingNames.length > 0) break;
        continue;
      }
      if (known.has(line)) pendingNames.push(line);
      else if (pendingNames.length > 0) break;
    }
  }

  if (/migration(?:\(s\)|s)? have failed|failed migration/i.test(text)) {
    return { status: 'NEEDS_REVIEW', pendingMigrations: pendingNames };
  }
  if (/history and the migrations table .* different|missing from .* migrations/i.test(text)) {
    return { status: 'NEEDS_REVIEW', pendingMigrations: pendingNames };
  }
  if (pendingStart >= 0) {
    return pendingNames.length > 0
      ? { status: 'PENDING', pendingMigrations: pendingNames }
      : { status: 'UNKNOWN', pendingMigrations: [] };
  }
  if (/database schema is up to date|all migrations have been successfully applied/i.test(text)) {
    return { status: 'UP_TO_DATE', pendingMigrations: [] };
  }
  return { status: 'UNKNOWN', pendingMigrations: [] };
}
