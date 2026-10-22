import { pathToFileURL } from 'node:url';
import { runMigrationProcess } from './migration-process.mjs';
import {
  matchesExpectedProject,
  resolveMigrationDirectUrl,
} from './deploy-migrations-for-vercel.mjs';
import { runtimeDatabaseUrl } from '../src/runtime-database-url.ts';
import { releaseCaPath } from './release-ca.mjs';

const project = 'vtkzinaudznwbsjoyszk';
const confirmation = `VERIFY_RELEASE_20261020_SCHEMA_TO_${project}`;
const success = 'Database schema readiness gate passed.';

/** Run the existing SELECT-only gate; never invoke a migration operation. */
export async function verifyReleaseReadiness(
  execute = runMigrationProcess,
  environment = process.env,
) {
  let diagnostic = 'environment-invalid';
  let childEnvironment;
  try {
    if (environment.VERCEL_ENV !== 'production') throw new Error('INVALID_ENVIRONMENT');
    diagnostic = 'confirmation-invalid';
    if (environment.RELEASE_READINESS_CONFIRMATION !== confirmation)
      throw new Error('INVALID_CONFIRMATION');
    diagnostic = 'project-ref-invalid';
    if (environment.RELEASE_READINESS_EXPECTED_PROJECT_REF !== project)
      throw new Error('INVALID_PROJECT');
    diagnostic = 'connection-target-invalid';
    const source = new URL(environment.DATABASE_URL);
    if (!matchesExpectedProject(source.toString(), project) || !source.password)
      throw new Error('INVALID_SOURCE');
    const direct = source.hostname === `db.${project}.supabase.co`;
    if (!(direct ? source.port === '5432' : ['5432', '6543'].includes(source.port)))
      throw new Error('INVALID_PORT');
    diagnostic = 'tls-mode-invalid';
    if (
      ![null, 'prefer', 'require', 'verify-ca', 'verify-full'].includes(
        source.searchParams.get('sslmode'),
      ) ||
      ![null, 'strict'].includes(source.searchParams.get('sslaccept'))
    )
      throw new Error('INVALID_TLS');
    diagnostic = 'pooler-target-invalid';
    const host = environment.SUPABASE_SESSION_POOLER_HOST;
    if (!host || !/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(host))
      throw new Error('INVALID_POOLER');
    const url = new URL(resolveMigrationDirectUrl(source.toString(), host));
    if (url.hostname !== host || !matchesExpectedProject(url.toString(), project))
      throw new Error('INVALID_POOLER_TARGET');
    diagnostic = 'release-ca-certificate-invalid';
    const ca = releaseCaPath();
    // Strip query-string host/schema/CA/options overrides before deriving the
    // same 6543 + PgBouncer settings used by the normal runtime helper.
    url.search = '';
    url.searchParams.set('schema', 'public');
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('sslaccept', 'strict');
    url.searchParams.set('sslcert', ca);
    url.searchParams.set('connect_timeout', '10');
    url.searchParams.set('socket_timeout', '60');
    const connection = runtimeDatabaseUrl(url.toString());
    childEnvironment = { ...environment, DATABASE_URL: connection, DIRECT_URL: connection };
    for (const key of Object.keys(childEnvironment))
      if (key.startsWith('PG')) delete childEnvironment[key];
  } catch {
    console.error(
      `[database] RELEASE_READINESS_CONFIGURATION_INVALID (${diagnostic}): values are not logged.`,
    );
    return 1;
  }
  const result = await execute('pnpm', ['--filter', '@bunshin/database', 'db:assert-ready'], {
    cwd: new URL('../', import.meta.url),
    env: childEnvironment,
    captureOutput: true,
    timeoutMs: 180000,
  });
  if (
    result.reason !== 'EXITED' ||
    result.status !== 0 ||
    !result.capturedOutput?.split(/\r?\n/).includes(success)
  ) {
    const reason = result.capturedOutput?.includes(
      'Production deployment blocked: the database is behind the application schema.',
    )
      ? 'schema-not-ready'
      : (result.diagnostic ??
        (result.status === 0 ? 'success-marker-missing' : result.reason.toLowerCase()));
    console.error(
      `[database] RELEASE_READINESS_FAILED (${reason}): no migration executed; values are not logged.`,
    );
    return 1;
  }
  console.log(
    `[database] RELEASE_SCHEMA_READINESS_VERIFIED: target ${project}; transaction pooler; read-only check; no migration executed.`,
  );
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.platform !== 'linux') {
    console.error(
      '[database] RELEASE_READINESS_LINUX_RUNNER_REQUIRED: use the approved GitHub workflow.',
    );
    process.exitCode = 1;
  } else process.exitCode = await verifyReleaseReadiness();
}
