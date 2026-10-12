import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { runMigrationProcess } from './migration-process.mjs';

const requireModule = createRequire(import.meta.url);
const boundedReleaseMigrations = [
  '20261007170000_add_oem_registration_billing',
  '20261007173000_oem_billing_guardrails',
  '20261011200000_oem_service_product_policy',
  '20261011220000_oem_product_policy_admin',
  '20261011230000_oem_setup_fee_invoicing',
  '20261012070000_oem_contract_period_supersession',
  '20261012080000_oem_operational_period_supersession',
  '20261012090000_oem_billing_policy_revision',
];

export function resolveMigrationBounds(environment) {
  const bounded = (name, fallback, maximum) => {
    const raw = environment[name] ?? String(fallback);
    if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw)))
      throw new Error('INVALID_MIGRATION_BOUNDS');
    const value = Number(raw);
    if (value > maximum) throw new Error('INVALID_MIGRATION_BOUNDS');
    return value;
  };
  const lockTimeoutMs = bounded('MIGRATION_LOCK_TIMEOUT_MS', 5000, 10000);
  const statementTimeoutMs = bounded('MIGRATION_STATEMENT_TIMEOUT_MS', 60000, 120000);
  const processTimeoutMs = bounded('MIGRATION_PROCESS_TIMEOUT_MS', 300000, 600000);
  if (lockTimeoutMs >= statementTimeoutMs || statementTimeoutMs >= processTimeoutMs)
    throw new Error('INVALID_MIGRATION_BOUNDS');
  return { lockTimeoutMs, statementTimeoutMs, processTimeoutMs };
}

export function withMigrationBounds(directUrl, bounds) {
  const url = new URL(directUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.searchParams.has('options'))
    throw new Error('INVALID_MIGRATION_CONNECTION');
  url.searchParams.set('connect_timeout', '10');
  url.searchParams.set('application_name', 'bunshin_migration_bounded');
  return url.toString();
}

export function assertBoundedReleaseMigrations(bounds) {
  const required = [
    'BEGIN;',
    `SET LOCAL lock_timeout = '${bounds.lockTimeoutMs}ms';`,
    `SET LOCAL statement_timeout = '${bounds.statementTimeoutMs}ms';`,
    `SET LOCAL idle_in_transaction_session_timeout = '${bounds.statementTimeoutMs}ms';`,
    'COMMIT;',
  ];
  for (const migration of boundedReleaseMigrations) {
    const sql = readFileSync(
      new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url),
      'utf8',
    )
      .replace(/\r\n/g, '\n')
      .trim();
    let previous = -1;
    if (
      !sql.startsWith('BEGIN;') ||
      !sql.endsWith('COMMIT;') ||
      required.some((statement) => {
        const position = sql.indexOf(statement);
        const ordered = position > previous;
        previous = position;
        return !ordered || sql.indexOf(statement, position + statement.length) !== -1;
      })
    ) {
      throw new Error('RELEASE_MIGRATION_BOUNDS_MISSING');
    }
  }
}

export function resolveMigrationDirectUrl(directUrl, sessionPoolerHost) {
  const url = new URL(directUrl);
  const projectMatch = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);

  if (!projectMatch) {
    return directUrl;
  }

  if (!sessionPoolerHost) {
    throw new Error(
      'SUPABASE_SESSION_POOLER_HOST is required when DIRECT_URL uses the Supabase direct host.',
    );
  }

  const projectRef = projectMatch[1];
  const username = decodeURIComponent(url.username);

  url.hostname = sessionPoolerHost;
  url.port = '5432';
  url.username = username.endsWith(`.${projectRef}`) ? username : `${username}.${projectRef}`;

  return url.toString();
}

export function runVercelMigration(environment = process.env, execute = runMigrationProcess) {
  return runMigration(environment, execute, false);
}

export function runMigrationConnectionProbe(
  environment = process.env,
  execute = runMigrationProcess,
) {
  return runMigration(environment, execute, true);
}

function matchesExpectedProject(connection, projectRef) {
  const url = new URL(connection);
  const direct = url.hostname === `db.${projectRef}.supabase.co`;
  const pooler = url.hostname.endsWith('.pooler.supabase.com');
  const role = decodeURIComponent(url.username);
  return (
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
    url.pathname === '/postgres' &&
    ((direct && role === 'postgres') || (pooler && role === `postgres.${projectRef}`))
  );
}

async function runMigration(environment, execute, probeOnly) {
  if (environment.VERCEL_ENV !== 'production') {
    if (probeOnly) {
      console.error('[database] MIGRATION_PROBE_ENVIRONMENT_INVALID: production context required.');
      return 1;
    }
    console.log(
      `[database] Skipping migrations for Vercel environment: ${environment.VERCEL_ENV ?? 'local'}`,
    );
    return 0;
  }

  const missingVariables = ['DATABASE_URL', 'DIRECT_URL'].filter((name) => !environment[name]);

  if (missingVariables.length > 0) {
    console.error(`[database] Production migrations require: ${missingVariables.join(', ')}`);
    return 1;
  }

  let migrationDirectUrl;
  let bounds;
  let prismaCli;

  try {
    if (probeOnly) {
      const expectedProject = environment.MIGRATION_PROBE_EXPECTED_PROJECT_REF;
      if (
        !/^[a-z0-9]{20}$/.test(expectedProject ?? '') ||
        !matchesExpectedProject(environment.DATABASE_URL, expectedProject) ||
        !matchesExpectedProject(environment.DIRECT_URL, expectedProject)
      ) {
        throw new Error('MIGRATION_PROBE_TARGET_INVALID');
      }
    }
    bounds = resolveMigrationBounds(environment);
    assertBoundedReleaseMigrations(bounds);
    migrationDirectUrl = withMigrationBounds(
      resolveMigrationDirectUrl(environment.DIRECT_URL, environment.SUPABASE_SESSION_POOLER_HOST),
      bounds,
    );
    if (
      probeOnly &&
      (!matchesExpectedProject(
        migrationDirectUrl,
        environment.MIGRATION_PROBE_EXPECTED_PROJECT_REF,
      ) ||
        new URL(migrationDirectUrl).port !== '5432')
    ) {
      throw new Error('MIGRATION_PROBE_TARGET_INVALID');
    }
    prismaCli = requireModule.resolve('prisma/build/index.js');
  } catch {
    console.error(
      '[database] MIGRATION_CONFIGURATION_INVALID: check URL, pooler host and bounded timeout settings; values are not logged.',
    );
    return 1;
  }

  console.log(
    `[database] ${probeOnly ? 'Probing migration connection only' : 'Applying production migrations'}: lock=${bounds.lockTimeoutMs}ms statement=${bounds.statementTimeoutMs}ms process=${bounds.processTimeoutMs}ms.`,
  );
  const childEnvironment = {
    ...environment,
    DATABASE_URL: migrationDirectUrl,
    DIRECT_URL: migrationDirectUrl,
  };
  delete childEnvironment.PGOPTIONS;
  let result;
  try {
    const startedAt = performance.now();
    // Supabase's session pooler can reject PostgreSQL startup `options`. Apply and verify
    // the same transaction-local settings used by every release migration instead.
    const probe = await execute(
      process.execPath,
      [prismaCli, 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'],
      {
        cwd: new URL('../', import.meta.url),
        env: childEnvironment,
        timeoutMs: bounds.processTimeoutMs,
        input: `BEGIN READ ONLY;
      SET LOCAL lock_timeout = '${bounds.lockTimeoutMs}ms';
      SET LOCAL statement_timeout = '${bounds.statementTimeoutMs}ms';
      SET LOCAL idle_in_transaction_session_timeout = '${bounds.statementTimeoutMs}ms';
      DO $$ BEGIN
        ${probeOnly ? "IF current_database() <> 'postgres' OR current_user <> 'postgres' THEN RAISE EXCEPTION 'MIGRATION_PROBE_IDENTITY_MISMATCH'; END IF;" : ''}
        IF current_setting('lock_timeout')::interval <> interval '${bounds.lockTimeoutMs} milliseconds'
           OR current_setting('statement_timeout')::interval <> interval '${bounds.statementTimeoutMs} milliseconds'
           OR current_setting('idle_in_transaction_session_timeout')::interval <> interval '${bounds.statementTimeoutMs} milliseconds'
        THEN RAISE EXCEPTION 'MIGRATION_BOUNDS_NOT_ACTIVE'; END IF;
      END $$;
      COMMIT;`,
      },
    );
    const remainingMs = Math.floor(bounds.processTimeoutMs - (performance.now() - startedAt));
    if (probe.reason !== 'EXITED' || probe.status !== 0 || remainingMs <= 0) {
      console.error(
        '[database] MIGRATION_PREFLIGHT_FAILED: no migrate deploy started. Verify connection settings and DB sessions before retry.',
      );
      return 1;
    }
    if (probeOnly) {
      console.log('[database] MIGRATION_CONNECTION_PROBE_PASSED: no migrate deploy started.');
      return 0;
    }
    // Direct CLI avoids a package-manager shell between this runner and the Prisma engine.
    result = await execute(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: new URL('../', import.meta.url),
      env: childEnvironment,
      timeoutMs: remainingMs,
    });
  } catch {
    result = { reason: 'START_FAILED', status: 1 };
  }
  if (result.reason !== 'EXITED' || result.status !== 0) {
    console.error(
      '[database] MIGRATION_FAILED_OR_UNCONFIRMED: build stopped; do not retry automatically. Verify DB sessions, locks, schema and migration history before human-approved recovery.',
    );
    return 1;
  }
  console.log('[database] Migration command completed successfully.');
  return 0;
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  process.exitCode = await runVercelMigration();
}
