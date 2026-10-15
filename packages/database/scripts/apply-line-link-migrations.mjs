import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { performance } from 'node:perf_hooks';
import { parseMigrationHistoryStatus } from './migration-history-status.mjs';
import { runMigrationProcess } from './migration-process.mjs';
import {
  matchesExpectedProject,
  resolveMigrationBounds,
  withMigrationBounds,
} from './deploy-migrations-for-vercel.mjs';

const requireModule = createRequire(import.meta.url);
const expectedMigrations = [
  '20261014090000_add_line_link_attempt_method',
  '20261014091000_allow_line_link_attempt_method',
];
const expectedProjectRef = 'vtkzinaudznwbsjoyszk';
const confirmation = 'APPLY_TWO_LINE_LINK_MIGRATIONS_TO_vtkzinaudznwbsjoyszk';

function validDirectTarget(connection) {
  const url = new URL(connection);
  return (
    matchesExpectedProject(connection, expectedProjectRef) &&
    url.hostname === `db.${expectedProjectRef}.supabase.co` &&
    url.port === '5432' &&
    url.pathname === '/postgres' &&
    url.searchParams.get('sslmode') === 'require' &&
    !url.searchParams.has('options')
  );
}

function historyStatus(output, exitStatus) {
  const parsed = parseMigrationHistoryStatus(output);
  if (parsed.status === 'UP_TO_DATE' && exitStatus === 0) return parsed;
  if (parsed.status === 'PENDING' && (exitStatus === 0 || exitStatus === 1)) return parsed;
  return { status: 'UNKNOWN', pendingMigrations: [] };
}

async function requestConfirmation() {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    return await terminal.question(`\nTo apply exactly these migrations, type ${confirmation}: `);
  } finally {
    terminal.close();
  }
}

async function run(
  execute = runMigrationProcess,
  environment = process.env,
  confirm = requestConfirmation,
) {
  const databaseUrl = environment.DATABASE_URL;
  const directUrl = environment.DIRECT_URL;
  let bounds;
  let boundedUrl;
  let prismaCli;

  try {
    if (
      !databaseUrl ||
      !directUrl ||
      databaseUrl !== directUrl ||
      !validDirectTarget(databaseUrl) ||
      !decodeURIComponent(new URL(databaseUrl).password)
    ) {
      throw new Error('TARGET_INVALID');
    }
    bounds = resolveMigrationBounds(environment);
    boundedUrl = withMigrationBounds(databaseUrl, bounds);
    prismaCli = requireModule.resolve('prisma/build/index.js');
  } catch {
    console.error('[database] DIRECT_MIGRATION_CONFIGURATION_INVALID: no database changes made.');
    return 1;
  }

  const childEnvironment = { ...environment, DATABASE_URL: boundedUrl, DIRECT_URL: boundedUrl };
  delete childEnvironment.PGOPTIONS;
  const cwd = new URL('../', import.meta.url);
  const startedAt = performance.now();

  const identity = await execute(
    process.execPath,
    [prismaCli, 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'],
    {
      cwd,
      env: childEnvironment,
      timeoutMs: Math.min(bounds.processTimeoutMs, 30000),
      input: `BEGIN READ ONLY;
      DO $$ BEGIN
        IF current_database() <> 'postgres' OR current_user <> 'postgres'
           OR current_setting('lock_timeout')::interval <> interval '${bounds.lockTimeoutMs} milliseconds'
           OR current_setting('statement_timeout')::interval <> interval '${bounds.statementTimeoutMs} milliseconds'
           OR current_setting('idle_in_transaction_session_timeout')::interval <> interval '${bounds.statementTimeoutMs} milliseconds'
        THEN RAISE EXCEPTION 'DIRECT_MIGRATION_PREFLIGHT_FAILED'; END IF;
      END $$;
      COMMIT;`,
    },
  );
  if (identity.reason !== 'EXITED' || identity.status !== 0) {
    console.error(
      `[database] DIRECT_MIGRATION_PREFLIGHT_FAILED (${identity.diagnostic ?? identity.reason.toLowerCase()}): no migration started.`,
    );
    return 1;
  }

  const readHistory = async () =>
    execute(
      process.execPath,
      [prismaCli, 'migrate', 'status', '--schema', 'prisma/schema.prisma'],
      {
        cwd,
        env: childEnvironment,
        timeoutMs: Math.min(bounds.processTimeoutMs, 60000),
        captureOutput: true,
      },
    );
  const before = await readHistory();
  if (before.reason !== 'EXITED') {
    console.error('[database] DIRECT_MIGRATION_HISTORY_UNCONFIRMED: no migration started.');
    return 1;
  }
  const status = historyStatus(before.capturedOutput ?? '', before.status);
  if (status.status === 'UP_TO_DATE') {
    console.log('[database] Direct migration not needed: schema is already up to date.');
    return 0;
  }
  if (
    status.status !== 'PENDING' ||
    status.pendingMigrations.length !== expectedMigrations.length ||
    expectedMigrations.some((migration, index) => status.pendingMigrations[index] !== migration)
  ) {
    console.error(
      '[database] DIRECT_MIGRATION_PENDING_SET_MISMATCH: no migration started; review migration history.',
    );
    return 1;
  }

  console.log(
    `[database] Target project: ${expectedProjectRef}; database/role: postgres/postgres.`,
  );
  console.log('[database] Pending migrations:');
  for (const migration of status.pendingMigrations) console.log(`- ${migration}`);
  if (performance.now() - startedAt >= bounds.processTimeoutMs) {
    console.error('[database] DIRECT_MIGRATION_DEADLINE_EXCEEDED: no migration started.');
    return 1;
  }

  let answer;
  try {
    answer = await confirm(confirmation);
  } catch {
    console.error('[database] DIRECT_MIGRATION_CONFIRMATION_UNAVAILABLE: no migration started.');
    return 1;
  }
  if (answer !== confirmation) {
    console.log('[database] Confirmation did not match; no migration started.');
    return 1;
  }

  const remainingMs = Math.floor(bounds.processTimeoutMs - (performance.now() - startedAt));
  if (remainingMs <= 0) {
    console.error('[database] DIRECT_MIGRATION_DEADLINE_EXCEEDED: migration not started.');
    return 1;
  }

  const applied = await execute(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    { cwd, env: childEnvironment, timeoutMs: remainingMs },
  );
  if (applied.reason !== 'EXITED' || applied.status !== 0) {
    console.error(
      '[database] DIRECT_MIGRATION_FAILED_OR_UNCONFIRMED: stop; do not retry. Check sessions, schema and migration history first.',
    );
    return 1;
  }

  const after = await readHistory();
  if (
    after.reason !== 'EXITED' ||
    historyStatus(after.capturedOutput ?? '', after.status).status !== 'UP_TO_DATE'
  ) {
    console.error(
      '[database] DIRECT_MIGRATION_POSTCHECK_FAILED: application result is unconfirmed; do not retry.',
    );
    return 1;
  }
  console.log('[database] DIRECT_MIGRATION_APPLIED_AND_VERIFIED: schema is up to date.');
  return 0;
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) process.exitCode = await run();

export { run as runDirectLineLinkMigration };
