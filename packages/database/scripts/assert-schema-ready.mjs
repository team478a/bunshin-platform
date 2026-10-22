import { fileURLToPath, pathToFileURL } from 'node:url';
import { runMigrationProcess } from './migration-process.mjs';

const marker = 'Database schema readiness gate passed.';

/** A bounded, read-only Client worker. Never invoke Prisma's migration CLI. */
export async function runSchemaReadiness(environment = process.env, execute = runMigrationProcess) {
  if (environment.VERCEL_ENV && environment.VERCEL_ENV !== 'production') {
    console.log('[database] Skipping production database check for non-production Vercel build.');
    return 0;
  }
  const env = { ...environment };
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  const result = await execute(
    process.execPath,
    [fileURLToPath(new URL('./deployment-database-worker.mjs', import.meta.url))],
    {
      cwd: new URL('../', import.meta.url),
      env,
      timeoutMs: 60000,
      captureOutput: true,
    },
  );
  if (
    result.reason !== 'EXITED' ||
    result.status !== 0 ||
    !result.capturedOutput?.split(/\r?\n/).includes(marker)
  ) {
    const labels = [
      'configuration-invalid',
      'manifest-invalid',
      'history-missing',
      'history-unexpected',
      'history-checksum-mismatch',
      'history-incomplete',
      'history-duplicate',
      'table-missing',
      'column-missing',
      'enum-missing',
    ];
    const label =
      result.reason === 'DEADLINE_EXCEEDED'
        ? 'deadline-exceeded'
        : (labels.find((item) =>
            result.capturedOutput
              ?.split(/\r?\n/)
              .includes(`[database] DEPLOYMENT_GATE_FAILED (${item}).`),
          ) ?? 'database-check-failed');
    console.error(
      `[database] DEPLOYMENT_GATE_FAILED (${label}): no migration executed; build stopped.`,
    );
    return 1;
  }
  console.log(marker);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runSchemaReadiness();
