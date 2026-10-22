import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { runMigrationProcess } from './migration-process.mjs';
import { parseMigrationHistoryStatus } from './migration-history-status.mjs';
import {
  matchesExpectedProject,
  resolveMigrationBounds,
  resolveMigrationDirectUrl,
  withMigrationBounds,
  withMigrationConnectionMetadata,
} from './deploy-migrations-for-vercel.mjs';

const requireModule = createRequire(import.meta.url);
const expectedProjectRef = 'vtkzinaudznwbsjoyszk';
const expectedConfirmation = `APPLY_RELEASE_20261020_MIGRATIONS_TO_${expectedProjectRef}`;
const approvedMigrations = [
  '20261019120000_learning_provider_abstraction',
  '20261020100000_personal_learning_tool_feature_updates',
  '20261020120000_ops_morning_digest_runs',
];

function sessionTargetIssue(connection, sessionPoolerHost) {
  let url;
  try {
    url = new URL(connection);
  } catch {
    return 'url-invalid';
  }
  if (!matchesExpectedProject(connection, expectedProjectRef))
    return 'project-role-or-path-invalid';
  if (url.hostname !== sessionPoolerHost) return 'session-pooler-host-mismatch';
  if (!url.hostname.endsWith('.pooler.supabase.com')) return 'not-a-supabase-pooler-host';
  if (url.port !== '5432') return 'session-pooler-port-invalid';
  // Supabase may provide a URL without an explicit sslmode (the PostgreSQL
  // client defaults to TLS-preferred mode). Enforce TLS on the live backend
  // connection below, before any migration can start.
  if (
    ![null, 'prefer', 'require', 'verify-ca', 'verify-full'].includes(
      url.searchParams.get('sslmode'),
    )
  )
    return 'tls-mode-invalid';
  if (!url.password) return 'password-missing';
  try {
    if (decodeURIComponent(url.username) !== `postgres.${expectedProjectRef}`)
      return 'pooler-role-invalid';
  } catch {
    return 'pooler-role-invalid';
  }
  return null;
}

function historyStatus(output, exitStatus) {
  const parsed = parseMigrationHistoryStatus(output);
  if (parsed.status === 'UP_TO_DATE' && exitStatus === 0) return parsed;
  if (parsed.status === 'PENDING' && (exitStatus === 0 || exitStatus === 1)) return parsed;
  return { status: 'UNKNOWN', pendingMigrations: [] };
}

export async function runRelease20261020Migration(
  execute = runMigrationProcess,
  environment = process.env,
) {
  if (environment.VERCEL_ENV !== 'production') {
    console.error('[database] RELEASE_MIGRATION_ENVIRONMENT_INVALID: production context required.');
    return 1;
  }

  let bounds;
  let boundedUrl;
  let historyUrl;
  let prismaCli;
  let configurationDiagnostic = 'unclassified';
  try {
    const projectRef = environment.MIGRATION_APPLY_EXPECTED_PROJECT_REF;
    const sessionPoolerHost = environment.SUPABASE_SESSION_POOLER_HOST;
    configurationDiagnostic = 'project-ref-invalid';
    if (projectRef !== expectedProjectRef || !/^[a-z0-9]{20}$/.test(projectRef ?? ''))
      throw new Error('INVALID_PROJECT_REF');
    configurationDiagnostic = 'connection-url-missing';
    if (!environment.DATABASE_URL || !environment.DIRECT_URL)
      throw new Error('MISSING_CONNECTION_URL');
    configurationDiagnostic = 'database-url-target-invalid';
    if (!matchesExpectedProject(environment.DATABASE_URL, expectedProjectRef))
      throw new Error('DATABASE_URL_TARGET_INVALID');
    configurationDiagnostic = 'direct-url-target-invalid';
    if (!matchesExpectedProject(environment.DIRECT_URL, expectedProjectRef))
      throw new Error('DIRECT_URL_TARGET_INVALID');
    configurationDiagnostic = 'session-pooler-host-invalid';
    if (!sessionPoolerHost || !/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(sessionPoolerHost))
      throw new Error('SESSION_POOLER_HOST_INVALID');
    configurationDiagnostic = 'session-pooler-resolution-failed';
    let sessionUrl = resolveMigrationDirectUrl(environment.DIRECT_URL, sessionPoolerHost);
    configurationDiagnostic = 'session-pooler-target-invalid';
    const sessionIssue = sessionTargetIssue(sessionUrl, sessionPoolerHost);
    if (sessionIssue) {
      configurationDiagnostic = `session-pooler-target-invalid:${sessionIssue}`;
      throw new Error('POOLER_INVALID');
    }
    const sessionUrlWithTls = new URL(sessionUrl);
    if ([null, 'prefer'].includes(sessionUrlWithTls.searchParams.get('sslmode'))) {
      sessionUrlWithTls.searchParams.set('sslmode', 'require');
      sessionUrl = sessionUrlWithTls.toString();
    }
    configurationDiagnostic = 'migration-timeout-settings-invalid';
    bounds = resolveMigrationBounds(environment);
    configurationDiagnostic = 'bounded-session-url-invalid';
    boundedUrl = withMigrationBounds(sessionUrl, bounds);
    historyUrl = withMigrationConnectionMetadata(sessionUrl, 'bunshin_release_migration_history');
    configurationDiagnostic = 'prisma-cli-unavailable';
    prismaCli = requireModule.resolve('prisma/build/index.js');
  } catch {
    console.error(
      `[database] RELEASE_MIGRATION_CONFIGURATION_INVALID (${configurationDiagnostic}): target or connection settings rejected; values are not logged.`,
    );
    return 1;
  }

  const confirmation = environment.MIGRATION_APPLY_CONFIRMATION;
  if (confirmation !== expectedConfirmation) {
    console.error('[database] RELEASE_MIGRATION_CONFIRMATION_INVALID: no migration started.');
    return 1;
  }

  const childEnvironment = { ...environment, DATABASE_URL: boundedUrl, DIRECT_URL: boundedUrl };
  delete childEnvironment.PGOPTIONS;
  const historyEnvironment = {
    ...childEnvironment,
    DATABASE_URL: historyUrl,
    DIRECT_URL: historyUrl,
  };
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
        THEN RAISE EXCEPTION 'MIGRATION_PROBE_IDENTITY_MISMATCH'; END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_stat_ssl
          WHERE pid = pg_backend_pid() AND ssl
        ) THEN RAISE EXCEPTION 'RELEASE_MIGRATION_TLS_NOT_ACTIVE'; END IF;
        IF current_setting('lock_timeout')::interval <> interval '${bounds.lockTimeoutMs} milliseconds'
           OR current_setting('statement_timeout')::interval <> interval '${bounds.statementTimeoutMs} milliseconds'
           OR current_setting('idle_in_transaction_session_timeout')::interval <> interval '${bounds.statementTimeoutMs} milliseconds'
        THEN RAISE EXCEPTION 'MIGRATION_BOUNDS_NOT_ACTIVE'; END IF;
      END $$;
      COMMIT;`,
    },
  );
  if (identity.reason !== 'EXITED' || identity.status !== 0) {
    console.error(
      `[database] RELEASE_MIGRATION_PREFLIGHT_FAILED (${identity.diagnostic ?? identity.reason.toLowerCase()}): no migration started.`,
    );
    return 1;
  }

  const readHistory = () =>
    execute(
      process.execPath,
      [prismaCli, 'migrate', 'status', '--schema', 'prisma/schema.prisma'],
      {
        cwd,
        env: historyEnvironment,
        timeoutMs: Math.min(bounds.processTimeoutMs, 60000),
        captureOutput: true,
      },
    );
  const before = await readHistory();
  if (before.reason !== 'EXITED') {
    console.error('[database] RELEASE_MIGRATION_HISTORY_UNCONFIRMED: no migration started.');
    return 1;
  }
  const status = historyStatus(before.capturedOutput ?? '', before.status);
  if (status.status === 'UP_TO_DATE') {
    console.log('[database] Release migrations already applied; no database changes made.');
    return 0;
  }
  if (
    status.status !== 'PENDING' ||
    status.pendingMigrations.length !== approvedMigrations.length ||
    approvedMigrations.some((migration, index) => status.pendingMigrations[index] !== migration)
  ) {
    console.error(
      '[database] RELEASE_MIGRATION_PENDING_SET_MISMATCH: no migration started; review migration history.',
    );
    return 1;
  }
  if (performance.now() - startedAt >= bounds.processTimeoutMs) {
    console.error('[database] RELEASE_MIGRATION_DEADLINE_EXCEEDED: no migration started.');
    return 1;
  }

  console.log(
    `[database] Approved target: ${expectedProjectRef}; database/role: postgres/postgres.`,
  );
  console.log('[database] Exact pending migration set:');
  for (const migration of status.pendingMigrations) console.log(`- ${migration}`);
  const remainingMs = Math.floor(bounds.processTimeoutMs - (performance.now() - startedAt));
  if (remainingMs <= 0) {
    console.error('[database] RELEASE_MIGRATION_DEADLINE_EXCEEDED: migration not started.');
    return 1;
  }

  const applied = await execute(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    { cwd, env: childEnvironment, timeoutMs: remainingMs },
  );
  if (applied.reason !== 'EXITED' || applied.status !== 0) {
    console.error(
      '[database] RELEASE_MIGRATION_FAILED_OR_UNCONFIRMED: stop; do not retry. Check migration history first.',
    );
    return 1;
  }

  const after = await readHistory();
  if (
    after.reason !== 'EXITED' ||
    historyStatus(after.capturedOutput ?? '', after.status).status !== 'UP_TO_DATE'
  ) {
    console.error(
      '[database] RELEASE_MIGRATION_POSTCHECK_FAILED: result is unconfirmed; do not retry.',
    );
    return 1;
  }
  console.log('[database] RELEASE_MIGRATIONS_APPLIED_AND_VERIFIED: schema is up to date.');
  return 0;
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) process.exitCode = await runRelease20261020Migration();
