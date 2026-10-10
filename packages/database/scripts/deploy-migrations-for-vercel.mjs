import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { runMigrationProcess } from './migration-process.mjs';

const requireModule = createRequire(import.meta.url);

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
  // Startup options apply to the actual migration engine connection, not another client.
  url.searchParams.set(
    'options',
    `-c lock_timeout=${bounds.lockTimeoutMs} -c statement_timeout=${bounds.statementTimeoutMs} -c idle_in_transaction_session_timeout=${bounds.statementTimeoutMs}`,
  );
  url.searchParams.set('connect_timeout', '10');
  url.searchParams.set('application_name', 'bunshin_migration_bounded');
  return url.toString();
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

  try {
    bounds = resolveMigrationBounds(environment);
    migrationDirectUrl = withMigrationBounds(
      resolveMigrationDirectUrl(environment.DIRECT_URL, environment.SUPABASE_SESSION_POOLER_HOST),
      bounds,
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
    // A pooler must not silently discard startup settings. Probe with the same CLI/URL.
    const probe = await execute(
      process.execPath,
      [prismaCli, 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'],
      {
        cwd: new URL('../', import.meta.url),
        env: childEnvironment,
        timeoutMs: bounds.processTimeoutMs,
        input: `DO $$ BEGIN
        IF current_setting('lock_timeout')::interval <> interval '${bounds.lockTimeoutMs} milliseconds'
           OR current_setting('statement_timeout')::interval <> interval '${bounds.statementTimeoutMs} milliseconds'
           OR current_setting('idle_in_transaction_session_timeout')::interval <> interval '${bounds.statementTimeoutMs} milliseconds'
        THEN RAISE EXCEPTION 'MIGRATION_BOUNDS_NOT_ACTIVE'; END IF;
      END $$;`,
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
