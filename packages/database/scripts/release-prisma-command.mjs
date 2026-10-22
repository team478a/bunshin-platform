import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { classifyMigrationProcessFailure } from './migration-process.mjs';

const labels = new Set([
  'database-authentication-failed',
  'database-unreachable',
  'database-connection-timeout',
  'database-not-found',
  'database-operation-timeout',
  'database-access-denied',
  'database-tls-failure',
  'database-url-invalid',
  'database-connection-closed',
  'connection-refused',
  'database-host-not-found',
  'database-connection-capacity',
  'database-lock-timeout',
  'database-statement-timeout',
  'prisma-process-start-failed',
  'prisma-process-stopped',
  'unclassified-preflight-error',
]);

export function readReleasePrismaDiagnostic(output) {
  const matches = String(output).matchAll(/^RELEASE_PRISMA_(PROBE|RESOLVE)_FAILED:([a-z-]+)\r?$/gm);
  for (const match of matches) {
    if (labels.has(match[2])) return { phase: match[1].toLowerCase(), diagnostic: match[2] };
  }
  return undefined;
}

function executePrisma(executable, args, options) {
  // Do not detach: psql, this wrapper, Prisma CLI and its engine must stay in
  // the outer runner's process group. Its deadline kills the entire group.
  return new Promise((resolve) => {
    let output = '';
    let incompleteInput = false;
    const child = spawn(executable, args, {
      env: options.env,
      detached: false,
      shell: false,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    const append = (chunk) => {
      output = (output + chunk.toString()).slice(-64 * 1024);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.once('error', () => resolve({ reason: 'START_FAILED', status: 1 }));
    child.stdin?.on('error', () => {
      incompleteInput = true;
    });
    child.stdin?.end(options.input);
    child.once('close', (code, signal) =>
      resolve({
        reason: signal ? 'SIGNALLED' : incompleteInput && code === 0 ? 'START_FAILED' : 'EXITED',
        status: code ?? 1,
        capturedOutput: output,
      }),
    );
  });
}

export async function runReleasePrismaCommand(
  args,
  environment = process.env,
  execute = executePrisma,
) {
  const [phase, executable, cli, schema, name] = args;
  if (
    !['probe', 'resolve'].includes(phase) ||
    !executable ||
    !cli ||
    !schema ||
    args.length !== (phase === 'probe' ? 4 : 5) ||
    (phase === 'resolve' && !/^\d{14}_[a-z0-9_]+$/.test(name ?? ''))
  ) {
    console.error('RELEASE_PRISMA_ARGUMENTS_INVALID');
    return 1;
  }
  const env = { ...environment };
  delete env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK;
  if (phase === 'resolve') env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = '1';
  let result;
  try {
    result = await execute(
      executable,
      phase === 'probe'
        ? [cli, 'db', 'execute', '--stdin', '--schema', schema]
        : [cli, 'migrate', 'resolve', '--applied', name, '--schema', schema],
      {
        env,
        ...(phase === 'probe' ? { input: 'BEGIN READ ONLY; SELECT 1; COMMIT;' } : {}),
      },
    );
  } catch {
    result = { reason: 'START_FAILED', status: 1 };
  }
  if (result.reason === 'EXITED' && result.status === 0) return 0;
  const classified =
    result.reason === 'START_FAILED'
      ? 'prisma-process-start-failed'
      : result.reason === 'SIGNALLED'
        ? 'prisma-process-stopped'
        : classifyMigrationProcessFailure(result.capturedOutput ?? '');
  const diagnostic = labels.has(classified) ? classified : 'unclassified-preflight-error';
  console.error(`RELEASE_PRISMA_${phase.toUpperCase()}_FAILED:${diagnostic}`);
  return 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await runReleasePrismaCommand(process.argv.slice(2));
}
