import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runMigrationProcess } from './migration-process.mjs';
import {
  matchesExpectedProject,
  resolveMigrationBounds,
  resolveMigrationDirectUrl,
  withMigrationConnectionMetadata,
} from './deploy-migrations-for-vercel.mjs';

const requireModule = createRequire(import.meta.url);
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

export async function runMigrationHistoryProbe(
  environment = process.env,
  execute = runMigrationProcess,
) {
  if (environment.VERCEL_ENV !== 'production') {
    console.error(
      '[database] MIGRATION_HISTORY_PROBE_ENVIRONMENT_INVALID: production context required.',
    );
    return 1;
  }
  const missing = ['DATABASE_URL', 'DIRECT_URL'].filter((name) => !environment[name]);
  if (missing.length > 0) {
    console.error(
      `[database] MIGRATION_HISTORY_PROBE_CONFIGURATION_INVALID: missing ${missing.join(', ')}.`,
    );
    return 1;
  }

  let cliPath;
  let historyUrl;
  let processTimeoutMs;
  let projectRef;
  try {
    projectRef = environment.MIGRATION_PROBE_EXPECTED_PROJECT_REF;
    if (
      !/^[a-z0-9]{20}$/.test(projectRef ?? '') ||
      !matchesExpectedProject(environment.DATABASE_URL, projectRef) ||
      !matchesExpectedProject(environment.DIRECT_URL, projectRef)
    ) {
      throw new Error('INVALID_TARGET');
    }
    processTimeoutMs = resolveMigrationBounds(environment).processTimeoutMs;
    const sessionUrl = resolveMigrationDirectUrl(
      environment.DIRECT_URL,
      environment.SUPABASE_SESSION_POOLER_HOST,
    );
    const session = new URL(sessionUrl);
    if (
      !matchesExpectedProject(sessionUrl, projectRef) ||
      session.port !== '5432' ||
      !session.hostname.endsWith('.pooler.supabase.com')
    ) {
      throw new Error('INVALID_SESSION_TARGET');
    }
    historyUrl = withMigrationConnectionMetadata(sessionUrl, 'bunshin_migration_history_probe');
    cliPath = requireModule.resolve('prisma/build/index.js');
  } catch {
    console.error(
      '[database] MIGRATION_HISTORY_PROBE_CONFIGURATION_INVALID: target or connection settings rejected; values are not logged.',
    );
    return 1;
  }

  const childEnvironment = { ...environment, DATABASE_URL: historyUrl, DIRECT_URL: historyUrl };
  delete childEnvironment.PGOPTIONS;
  const cwd = new URL('../', import.meta.url);
  const identity = await execute(
    process.execPath,
    [cliPath, 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'],
    {
      cwd,
      env: childEnvironment,
      timeoutMs: Math.min(processTimeoutMs, 30000),
      input: `BEGIN READ ONLY;
      SET LOCAL lock_timeout = '5s';
      SET LOCAL statement_timeout = '10s';
      SET LOCAL idle_in_transaction_session_timeout = '10s';
      DO $$ BEGIN
        IF current_database() <> 'postgres' OR current_user <> 'postgres' THEN
          RAISE EXCEPTION 'MIGRATION_PROBE_IDENTITY_MISMATCH';
        END IF;
      END $$;
      COMMIT;`,
    },
  );
  if (identity.reason !== 'EXITED' || identity.status !== 0) {
    console.error(
      `[database] MIGRATION_HISTORY_PROBE_FAILED (${identity.diagnostic ?? identity.reason.toLowerCase()}): history was not queried.`,
    );
    return 1;
  }

  const result = await execute(
    process.execPath,
    [cliPath, 'migrate', 'status', '--schema', 'prisma/schema.prisma'],
    {
      cwd,
      env: childEnvironment,
      timeoutMs: Math.min(processTimeoutMs, 60000),
      captureOutput: true,
    },
  );
  if (result.reason !== 'EXITED') {
    console.error(
      '[database] MIGRATION_HISTORY_PROBE_FAILED (history-read-incomplete): no database changes were made.',
    );
    return 1;
  }
  const parsed = parseMigrationHistoryStatus(result.capturedOutput ?? '');
  if (parsed.status === 'UNKNOWN') {
    console.error(
      '[database] MIGRATION_HISTORY_PROBE_FAILED (history-status-unrecognized): no database changes were made.',
    );
    return 1;
  }

  console.log(
    `[database] MIGRATION_HISTORY_PROBE ${parsed.status}: pending=${parsed.pendingMigrations.length}; migration changes=none.`,
  );
  for (const migration of parsed.pendingMigrations) {
    console.log(`[database] PENDING_MIGRATION ${migration}`);
  }
  if (parsed.status === 'UP_TO_DATE' && result.status !== 0) {
    console.error(
      '[database] MIGRATION_HISTORY_PROBE_FAILED (status-exit-mismatch): no database changes were made.',
    );
    return 1;
  }
  return 0;
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) process.exitCode = await runMigrationHistoryProbe();
