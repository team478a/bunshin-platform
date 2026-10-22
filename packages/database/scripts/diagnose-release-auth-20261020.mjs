import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  matchesExpectedProject,
  resolveMigrationDirectUrl,
} from './deploy-migrations-for-vercel.mjs';
import { runMigrationProcess } from './migration-process.mjs';
import { releaseCaPath } from './release-ca.mjs';
import { readReleasePrismaDiagnostic } from './release-prisma-command.mjs';

const project = 'vtkzinaudznwbsjoyszk';
const confirmation = `DIAGNOSE_RELEASE_20261020_AUTH_TO_${project}`;

export async function diagnoseReleaseAuth(
  execute = runMigrationProcess,
  environment = process.env,
) {
  let diagnostic = 'environment-invalid';
  let source;
  let ca;
  let credentialsMatch;
  try {
    if (environment.VERCEL_ENV !== 'production') throw new Error('INVALID_ENVIRONMENT');
    diagnostic = 'confirmation-invalid';
    if (environment.RELEASE_AUTH_CONFIRMATION !== confirmation)
      throw new Error('INVALID_CONFIRMATION');
    diagnostic = 'project-ref-invalid';
    if (environment.RELEASE_AUTH_EXPECTED_PROJECT_REF !== project)
      throw new Error('INVALID_PROJECT');
    diagnostic = 'pooler-host-invalid';
    const host = environment.SUPABASE_SESSION_POOLER_HOST;
    if (!host || !/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(host))
      throw new Error('INVALID_HOST');
    diagnostic = 'connection-target-invalid';
    const validated = (value) => {
      const input = new URL(value);
      const direct = input.hostname === `db.${project}.supabase.co`;
      const port = input.port || '5432';
      if (
        !matchesExpectedProject(input.toString(), project) ||
        !input.password ||
        !(direct ? port === '5432' : ['5432', '6543'].includes(port)) ||
        ![null, 'prefer', 'require', 'verify-ca', 'verify-full'].includes(
          input.searchParams.get('sslmode'),
        ) ||
        ![null, 'strict'].includes(input.searchParams.get('sslaccept'))
      )
        throw new Error('INVALID_CONNECTION');
      input.port = port;
      const url = new URL(resolveMigrationDirectUrl(input.toString(), host));
      if (url.hostname !== host || !matchesExpectedProject(url.toString(), project))
        throw new Error('INVALID_TARGET');
      return url;
    };
    source = validated(environment.DIRECT_URL);
    const runtime = validated(environment.DATABASE_URL);
    credentialsMatch =
      decodeURIComponent(source.username) === decodeURIComponent(runtime.username) &&
      decodeURIComponent(source.password) === decodeURIComponent(runtime.password);
    diagnostic = 'release-ca-certificate-invalid';
    ca = releaseCaPath();
  } catch {
    console.error(
      `[database] RELEASE_AUTH_CONFIGURATION_INVALID (${diagnostic}): values are not logged.`,
    );
    return 1;
  }
  console.log(
    `[database] RELEASE_AUTH_CREDENTIAL_REFERENCE: ${credentialsMatch ? 'MATCH' : 'DIFFERENT'}; values, lengths and hashes are not logged.`,
  );
  let verified = 0;
  for (const port of ['5432', '6543']) {
    const url = new URL(source);
    url.port = port;
    url.search = '';
    url.searchParams.set('schema', 'public');
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('sslaccept', 'strict');
    url.searchParams.set('sslcert', ca);
    url.searchParams.set('connect_timeout', '10');
    url.searchParams.set('socket_timeout', '15');
    url.searchParams.set('connection_limit', '1');
    if (port === '6543') url.searchParams.set('pgbouncer', 'true');
    const env = { ...environment, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() };
    for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
    const result = await execute(
      process.execPath,
      [fileURLToPath(new URL('./probe-release-auth-client.mjs', import.meta.url))],
      {
        cwd: new URL('../', import.meta.url),
        env,
        captureOutput: true,
        timeoutMs: 30000,
      },
    );
    const passed =
      result.reason === 'EXITED' &&
      result.status === 0 &&
      result.capturedOutput?.split(/\r?\n/).includes('RELEASE_AUTH_CONNECTION_VERIFIED');
    const reason = passed
      ? 'verified'
      : (readReleasePrismaDiagnostic(result.capturedOutput ?? '')?.diagnostic ??
        (result.reason === 'DEADLINE_EXCEEDED'
          ? 'deadline-exceeded'
          : 'probe-failed-or-unconfirmed'));
    console.log(
      `[database] RELEASE_AUTH_RESULT source=DIRECT_URL; port=${port}; result=${reason}.`,
    );
    if (passed) verified++;
  }
  console.log(
    `[database] RELEASE_AUTH_COMPARISON_COMPLETED: verified=${verified}/2; read-only; not a schema readiness or deployment approval.`,
  );
  return verified === 2 ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.platform !== 'linux') {
    console.error(
      '[database] RELEASE_AUTH_LINUX_RUNNER_REQUIRED: use the approved GitHub workflow.',
    );
    process.exitCode = 1;
  } else process.exitCode = await diagnoseReleaseAuth();
}
