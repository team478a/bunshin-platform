import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import { classifyMigrationProcessFailure } from './migration-process.mjs';

/** Internal child of the target-validated diagnostic runner. No application data. */
export async function probeReleaseAuth(
  environment = process.env,
  createClient = (connection) => new PrismaClient({ datasources: { db: { url: connection } } }),
) {
  let client;
  let diagnostic;
  try {
    if (!environment.DATABASE_URL) throw new Error('P1013');
    client = createClient(environment.DATABASE_URL);
    const verified = await client.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const rows = await transaction.$queryRawUnsafe(
          "SELECT current_database() = 'postgres' AND current_user = 'postgres' AND current_setting('transaction_read_only') = 'on' AS verified",
        );
        return rows[0]?.verified === true;
      },
      { maxWait: 5000, timeout: 15000 },
    );
    if (!verified) diagnostic = 'database-access-denied';
  } catch (error) {
    diagnostic =
      classifyMigrationProcessFailure(
        `${error?.code ?? ''} ${error?.errorCode ?? ''} ${error?.message ?? ''}`,
      ) ?? 'unclassified-preflight-error';
  } finally {
    try {
      await client?.$disconnect();
    } catch {
      diagnostic = 'database-connection-closed';
    }
  }
  if (diagnostic) {
    console.error(`RELEASE_PRISMA_PROBE_FAILED:${diagnostic}`);
    return 1;
  }
  console.log('RELEASE_AUTH_CONNECTION_VERIFIED');
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  process.exitCode = await probeReleaseAuth();
