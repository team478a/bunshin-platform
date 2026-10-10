import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { runMigrationProcess } from './migration-process.mjs';

const requireModule = createRequire(import.meta.url);
const targetMigration = '20261010070000_personal_learning_call_cost_reservation';
const expectedPredecessor = '20261008140000_learning_member_line_link';
const migrationDirectory = new URL('../prisma/migrations/', import.meta.url);

function releaseMigrationNames() {
  return readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function resolveMigrationBounds(environment) {
  const fixed = (name, expected) => {
    const raw = environment[name] ?? String(expected);
    if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) !== expected)
      throw new Error('INVALID_MIGRATION_BOUNDS');
    return expected;
  };
  const bounded = (name, fallback, maximum) => {
    const raw = environment[name] ?? String(fallback);
    if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw)))
      throw new Error('INVALID_MIGRATION_BOUNDS');
    const value = Number(raw);
    if (value > maximum) throw new Error('INVALID_MIGRATION_BOUNDS');
    return value;
  };
  // These two bounds are part of the committed target Migration and cannot drift at deploy time.
  const lockTimeoutMs = fixed('MIGRATION_LOCK_TIMEOUT_MS', 5000);
  const statementTimeoutMs = fixed('MIGRATION_STATEMENT_TIMEOUT_MS', 60000);
  const processTimeoutMs = bounded('MIGRATION_PROCESS_TIMEOUT_MS', 300000, 600000);
  if (lockTimeoutMs >= statementTimeoutMs || statementTimeoutMs >= processTimeoutMs)
    throw new Error('INVALID_MIGRATION_BOUNDS');
  return { lockTimeoutMs, statementTimeoutMs, processTimeoutMs };
}

export function withMigrationConnectionMetadata(directUrl) {
  const url = new URL(directUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.searchParams.has('options'))
    throw new Error('INVALID_MIGRATION_CONNECTION');
  url.searchParams.set('connect_timeout', '10');
  url.searchParams.set('application_name', 'bunshin_migration_bounded');
  return url.toString();
}

export function assertReleaseMigrationGuard() {
  const names = releaseMigrationNames();
  if (!names.every((name) => /^\d{14}_[a-z0-9_]+$/.test(name)))
    throw new Error('UNEXPECTED_MIGRATION_NAME');
  if (names.at(-1) !== targetMigration || names.at(-2) !== expectedPredecessor)
    throw new Error('UNEXPECTED_MIGRATION_LINEAGE');
  const sql = readFileSync(new URL(`${targetMigration}/migration.sql`, migrationDirectory), 'utf8');
  const executableSql = sql
    .replace(/\r\n/g, '\n')
    .replace(/^\s*--.*$/gm, '')
    .trim();
  const orderedGuards = [
    'BEGIN;',
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '60s';",
    "SET LOCAL idle_in_transaction_session_timeout = '60s';",
    'ALTER TABLE "personal_learning_call_admissions"',
    'COMMIT;',
  ];
  let previousPosition = -1;
  if (
    !executableSql.startsWith('BEGIN;') ||
    !executableSql.endsWith('COMMIT;') ||
    orderedGuards.some((guard) => {
      const position = executableSql.indexOf(guard);
      const unique = position >= 0 && executableSql.indexOf(guard, position + guard.length) === -1;
      const ordered = position > previousPosition;
      previousPosition = position;
      return !unique || !ordered;
    })
  )
    throw new Error('TARGET_MIGRATION_GUARD_MISSING');
  return names;
}

export function buildReleasePreflightSql(expectedMigrationNames) {
  if (
    !Array.isArray(expectedMigrationNames) ||
    expectedMigrationNames.length < 2 ||
    !expectedMigrationNames.every((name) => /^\d{14}_[a-z0-9_]+$/.test(name)) ||
    expectedMigrationNames.at(-1) !== targetMigration ||
    expectedMigrationNames.at(-2) !== expectedPredecessor
  )
    throw new Error('UNEXPECTED_MIGRATION_LINEAGE');
  const expectedMigrationCount = expectedMigrationNames.length;
  const expectedBefore = expectedMigrationCount - 1;
  const sqlArray = (names) => `ARRAY[${names.map((name) => `'${name}'`).join(',')}]::text[]`;
  const expectedBeforeNames = sqlArray(expectedMigrationNames.slice(0, -1));
  const expectedAfterNames = sqlArray(expectedMigrationNames);
  return `DO $$
DECLARE
  successful_count integer;
  target_applied boolean;
  expected_names text[];
BEGIN
  IF EXISTS (
    SELECT 1 FROM "_prisma_migrations"
    WHERE "finished_at" IS NULL OR "rolled_back_at" IS NOT NULL
  ) THEN RAISE EXCEPTION 'MIGRATION_HISTORY_NOT_CLEAN'; END IF;

  SELECT count(*) INTO successful_count
  FROM "_prisma_migrations"
  WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL;
  SELECT EXISTS (
    SELECT 1 FROM "_prisma_migrations"
    WHERE "migration_name" = '${targetMigration}'
      AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
  ) INTO target_applied;

  IF target_applied THEN
    expected_names := ${expectedAfterNames};
    IF successful_count <> ${expectedMigrationCount} OR EXISTS (
      SELECT "migration_name" FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
      EXCEPT SELECT unnest(expected_names)
    ) OR EXISTS (
      SELECT unnest(expected_names)
      EXCEPT SELECT "migration_name" FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
    )
    THEN RAISE EXCEPTION 'UNEXPECTED_POST_MIGRATION_HISTORY'; END IF;
  ELSE
    expected_names := ${expectedBeforeNames};
    IF successful_count <> ${expectedBefore} OR EXISTS (
      SELECT "migration_name" FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
      EXCEPT SELECT unnest(expected_names)
    ) OR EXISTS (
      SELECT unnest(expected_names)
      EXCEPT SELECT "migration_name" FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
    ) THEN RAISE EXCEPTION 'UNEXPECTED_PRE_MIGRATION_HISTORY'; END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'personal_learning_call_admissions'
        AND column_name IN ('reserved_cost_usd_micros', 'pricing_version')
    ) OR EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'personal_learning_call_admissions_cost_pair_check'
    ) OR EXISTS (
      SELECT 1 FROM public.personal_learning_call_admissions
    ) OR EXISTS (
      SELECT 1 FROM pg_locks l
      JOIN pg_class c ON c.oid = l.relation
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'personal_learning_call_admissions'
        AND NOT l.granted
    ) THEN RAISE EXCEPTION 'TARGET_MIGRATION_PREFLIGHT_CHANGED'; END IF;
  END IF;
END $$;`;
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

export async function runVercelMigration(environment = process.env, execute = runMigrationProcess) {
  if (environment.VERCEL_ENV !== 'production') {
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
  let expectedMigrationNames;

  try {
    bounds = resolveMigrationBounds(environment);
    expectedMigrationNames = assertReleaseMigrationGuard();
    migrationDirectUrl = withMigrationConnectionMetadata(
      resolveMigrationDirectUrl(environment.DIRECT_URL, environment.SUPABASE_SESSION_POOLER_HOST),
    );
    prismaCli = requireModule.resolve('prisma/build/index.js');
  } catch {
    console.error(
      '[database] MIGRATION_CONFIGURATION_INVALID: check URL, pooler host and bounded timeout settings; values are not logged.',
    );
    return 1;
  }

  console.log(
    `[database] Applying production migrations: lock=${bounds.lockTimeoutMs}ms statement=${bounds.statementTimeoutMs}ms process=${bounds.processTimeoutMs}ms.`,
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
    // The target SQL owns transaction-local DB bounds; this probe limits the release to its
    // audited lineage and preconditions before Prisma can start migrate deploy.
    const probe = await execute(
      process.execPath,
      [prismaCli, 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'],
      {
        cwd: new URL('../', import.meta.url),
        env: childEnvironment,
        timeoutMs: bounds.processTimeoutMs,
        input: buildReleasePreflightSql(expectedMigrationNames),
      },
    );
    const remainingMs = Math.floor(bounds.processTimeoutMs - (performance.now() - startedAt));
    if (probe.reason !== 'EXITED' || probe.status !== 0 || remainingMs <= 0) {
      console.error(
        '[database] MIGRATION_PREFLIGHT_FAILED: no migrate deploy started. Verify connection settings and DB sessions before retry.',
      );
      return 1;
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
