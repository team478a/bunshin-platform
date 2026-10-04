/** Test-only safety gate. Never reuse this as production authorization. */
export interface IntegrationDatabaseIdentity {
  database: string;
  marker: string | null;
}

type Environment = Readonly<Record<string, string | undefined>>;
export interface IntegrationDatabaseTarget {
  database: string;
  marker: string | null;
  mode: 'GITHUB_SERVICE' | 'LOCAL_DISPOSABLE';
}

function reject(): never {
  // Do not include connection strings, credentials or raw DB errors in diagnostics.
  throw new Error(
    'Integration database preflight refused: use an isolated disposable test database',
  );
}

/** Validate before creating a client or attempting any connection. No substring matching. */
export function integrationDatabaseTarget(env: Environment): IntegrationDatabaseTarget {
  if (env['NODE_ENV'] !== 'test' || env['APP_ENV'] !== 'development') reject();
  const raw = env['DATABASE_URL'];
  if (!raw || raw !== env['DIRECT_URL']) reject();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return reject();
  }
  if (url.protocol !== 'postgresql:' || url.search || url.hash) reject();

  if (env['GITHUB_ACTIONS'] === 'true') {
    if (
      env['CI'] !== 'true' ||
      env['GITHUB_REPOSITORY'] !== 'team478a/bunshin-platform' ||
      !/^\d+$/.test(env['GITHUB_RUN_ID'] ?? '') ||
      !/^[1-9]\d*$/.test(env['GITHUB_RUN_ATTEMPT'] ?? '') ||
      raw !== 'postgresql://postgres:postgres@localhost:5432/bunshin_platform_test'
    )
      reject();
    // Existing GitHub Actions service lifecycle is the CI isolation evidence.
    // This environment flag is NOT proof against a malicious local operator.
    return { database: 'bunshin_platform_test', marker: null, mode: 'GITHUB_SERVICE' };
  }
  if (env['CI'] || env['GITHUB_ACTIONS']) reject();
  const runId = env['BUNSHIN_TEST_RUN_ID'] ?? '';
  if (!/^[a-f0-9]{12,32}$/.test(runId)) reject();
  const database = `bunshin_disposable_${runId}`;
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '18998' ||
    url.username !== 'postgres' ||
    url.password.length < 16 ||
    url.pathname !== `/${database}`
  )
    reject();
  return { database, marker: `bunshin-disposable-test:${runId}`, mode: 'LOCAL_DISPOSABLE' };
}

/** Read-only live identity probe. Must complete before any fixture/cleanup write. */
export async function verifyIntegrationDatabase(
  target: IntegrationDatabaseTarget,
  readIdentity: () => Promise<IntegrationDatabaseIdentity[]>,
): Promise<void> {
  let identities: IntegrationDatabaseIdentity[];
  try {
    identities = await readIdentity();
  } catch {
    return reject();
  }
  const identity = identities[0];
  if (identities.length !== 1 || identity?.database !== target.database) reject();
  if (target.mode === 'LOCAL_DISPOSABLE' && identity.marker !== target.marker) reject();
}
