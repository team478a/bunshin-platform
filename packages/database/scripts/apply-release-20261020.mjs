import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { runMigrationProcess } from './migration-process.mjs';
import {
  matchesExpectedProject,
  resolveMigrationBounds,
  resolveMigrationDirectUrl,
} from './deploy-migrations-for-vercel.mjs';
import {
  buildPsqlReleaseScript,
  loadReleaseMigrations,
  psqlArguments,
  psqlEnvironment,
} from './release-psql.mjs';

const requireModule = createRequire(import.meta.url);
const expectedProjectRef = 'vtkzinaudznwbsjoyszk';
const expectedConfirmation = `APPLY_RELEASE_20261020_MIGRATIONS_TO_${expectedProjectRef}`;
const approvedNames = [
  '20261019120000_learning_provider_abstraction',
  '20261020100000_personal_learning_tool_feature_updates',
  '20261020120000_ops_morning_digest_runs',
];

const preconditionSql = `DO $pristine$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.ai_provider_configurations'::regclass
    AND attname = 'model_capabilities' AND NOT attisdropped)
    OR EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public."AiProviderKey"'::regtype AND enumlabel = 'GOOGLE')
    OR to_regclass('public.personal_learning_tool_feature_updates') IS NOT NULL
    OR to_regclass('public.personal_learning_tool_feature_audits') IS NOT NULL
    OR to_regclass('public.ops_morning_digest_runs') IS NOT NULL
  THEN RAISE EXCEPTION 'RELEASE_EXISTING_ARTIFACTS_REQUIRE_REVIEW'; END IF;
END $pristine$;`;

export async function runRelease20261020Migration(
  execute = runMigrationProcess,
  environment = process.env,
) {
  if (environment.VERCEL_ENV !== 'production') {
    console.error('[database] RELEASE_MIGRATION_ENVIRONMENT_INVALID: production context required.');
    return 1;
  }
  if (environment.MIGRATION_APPLY_CONFIRMATION !== expectedConfirmation) {
    console.error('[database] RELEASE_MIGRATION_CONFIRMATION_INVALID: no migration started.');
    return 1;
  }
  let configurationDiagnostic = 'unclassified';
  let childEnvironment;
  let script;
  let bounds;
  let mode;
  try {
    configurationDiagnostic = 'mode-invalid';
    mode = environment.MIGRATION_APPLY_MODE ?? 'preview';
    if (!['preview', 'apply'].includes(mode)) throw new Error('INVALID_MODE');
    configurationDiagnostic = 'project-ref-invalid';
    if (environment.MIGRATION_APPLY_EXPECTED_PROJECT_REF !== expectedProjectRef)
      throw new Error('INVALID_PROJECT');
    configurationDiagnostic = 'connection-url-missing';
    if (!environment.DATABASE_URL || !environment.DIRECT_URL) throw new Error('MISSING_CONNECTION');
    configurationDiagnostic = 'connection-target-invalid';
    if (
      !matchesExpectedProject(environment.DATABASE_URL, expectedProjectRef) ||
      !matchesExpectedProject(environment.DIRECT_URL, expectedProjectRef)
    )
      throw new Error('INVALID_TARGET');
    const host = environment.SUPABASE_SESSION_POOLER_HOST;
    configurationDiagnostic = 'session-pooler-host-invalid';
    if (!host || !/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(host))
      throw new Error('INVALID_HOST');
    const session = new URL(resolveMigrationDirectUrl(environment.DIRECT_URL, host));
    configurationDiagnostic = 'session-pooler-target-invalid';
    if (
      session.hostname !== host ||
      session.port !== '5432' ||
      !matchesExpectedProject(session.toString(), expectedProjectRef) ||
      !session.password ||
      session.searchParams.has('options')
    )
      throw new Error('INVALID_SESSION');
    configurationDiagnostic = 'tls-mode-invalid';
    if (
      ![null, 'prefer', 'require', 'verify-ca', 'verify-full'].includes(
        session.searchParams.get('sslmode'),
      )
    )
      throw new Error('INVALID_TLS');
    if ([null, 'prefer'].includes(session.searchParams.get('sslmode')))
      session.searchParams.set('sslmode', 'require');
    const resolver = new URL(session);
    resolver.searchParams.set('sslmode', 'require');
    resolver.searchParams.set('sslaccept', 'strict');
    resolver.searchParams.set('connect_timeout', '10');
    resolver.searchParams.set('socket_timeout', '60');
    if (session.searchParams.has('sslrootcert'))
      resolver.searchParams.set('sslcert', session.searchParams.get('sslrootcert'));
    configurationDiagnostic = 'migration-timeout-settings-invalid';
    bounds = resolveMigrationBounds(environment);
    configurationDiagnostic = 'release-source-invalid';
    const migrations = loadReleaseMigrations(new URL('../prisma/migrations/', import.meta.url));
    script = buildPsqlReleaseScript({
      migrations,
      approvedNames,
      bounds,
      mode,
      preconditionSql,
      resolveExecutable: process.execPath,
      prismaCli: requireModule.resolve('prisma/build/index.js'),
      schemaPath: fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
    });
    childEnvironment = psqlEnvironment(session.toString(), {
      ...environment,
      DATABASE_URL: resolver.toString(),
      DIRECT_URL: resolver.toString(),
    });
  } catch {
    console.error(
      `[database] RELEASE_MIGRATION_CONFIGURATION_INVALID (${configurationDiagnostic}): values are not logged.`,
    );
    return 1;
  }
  const result = await execute('psql', psqlArguments, {
    cwd: new URL('../', import.meta.url),
    env: childEnvironment,
    input: script,
    captureOutput: true,
    timeoutMs: bounds.processTimeoutMs,
  });
  const marker =
    mode === 'preview'
      ? 'RELEASE_PSQL_PREVIEW_VERIFIED'
      : 'RELEASE_MIGRATIONS_APPLIED_AND_VERIFIED';
  if (
    result.reason !== 'EXITED' ||
    result.status !== 0 ||
    !result.capturedOutput?.split(/\r?\n/).includes(marker)
  ) {
    console.error(
      `[database] RELEASE_PSQL_FAILED_OR_UNCONFIRMED (${result.diagnostic ?? result.reason.toLowerCase()}): stop; inspect schema/history before retrying.`,
    );
    return 1;
  }
  console.log(
    `[database] ${marker}: target ${expectedProjectRef}; approved migration count 3; mode ${mode}.`,
  );
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.platform !== 'linux') {
    console.error(
      '[database] RELEASE_PSQL_LINUX_RUNNER_REQUIRED: use the approved GitHub workflow.',
    );
    process.exitCode = 1;
  } else process.exitCode = await runRelease20261020Migration();
}
