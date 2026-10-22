import { spawn } from 'node:child_process';

const MAX_DIAGNOSTIC_BYTES = 64 * 1024;

/** Map Prisma/Node errors to fixed labels; never emit provider or SQL output. */
export function classifyMigrationProcessFailure(output) {
  const text = String(output).slice(-MAX_DIAGNOSTIC_BYTES);
  if (!text.trim()) return undefined;
  const labels = [
    [/RELEASE_MIGRATION_TLS_NOT_ACTIVE/i, 'database-session-not-encrypted'],
    [/MIGRATION_BOUNDS_NOT_ACTIVE/i, 'migration-bounds-not-active'],
    [/MIGRATION_PROBE_IDENTITY_MISMATCH/i, 'database-identity-mismatch'],
    [/\bP1000\b|authentication failed/i, 'database-authentication-failed'],
    [/\bP1001\b|can't reach database server|cannot reach database server/i, 'database-unreachable'],
    [/\bP1002\b|timed? out.*database|database.*timed? out/i, 'database-connection-timeout'],
    [/\bP1003\b|database .* does not exist/i, 'database-not-found'],
    [/\bP1008\b|operation timed out/i, 'database-operation-timeout'],
    [/\bP1010\b|user .* was denied access/i, 'database-access-denied'],
    [/\bP1011\b|tls|ssl/i, 'database-tls-failure'],
    [/\bP1013\b|invalid database string/i, 'database-url-invalid'],
    [/\bP1017\b|server has closed the connection/i, 'database-connection-closed'],
    [/ECONNREFUSED/i, 'connection-refused'],
    [/ENOTFOUND|EAI_AGAIN/i, 'database-host-not-found'],
    [/ETIMEDOUT/i, 'database-connection-timeout'],
    [/too many connections|remaining connection slots/i, 'database-connection-capacity'],
  ];
  return labels.find(([pattern]) => pattern.test(text))?.[1] ?? 'unclassified-preflight-error';
}

/** Child output is inspected only in memory and never emitted; it may contain secrets. */
export function runMigrationProcess(command, args, options) {
  return new Promise((resolve) => {
    let child;
    let timer;
    let settled = false;
    let output = '';
    const appendOutput = (chunk) => {
      output = (output + chunk.toString()).slice(-MAX_DIAGNOSTIC_BYTES);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const diagnostic =
        result.reason === 'EXITED' && result.status !== 0
          ? classifyMigrationProcessFailure(output)
          : undefined;
      const capturedOutput = options.captureOutput ? output : undefined;
      const withDiagnostic = diagnostic ? { ...result, diagnostic } : result;
      resolve(
        capturedOutput === undefined ? withDiagnostic : { ...withDiagnostic, capturedOutput },
      );
    };
    const terminate = () => {
      // Only this runner's child/group. This is NOT DB cancellation or drain.
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        // An unconfirmed termination never means migration success.
      }
      child.unref();
    };
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        detached: process.platform !== 'win32',
        stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        shell: false,
      });
    } catch {
      finish({ reason: 'START_FAILED', status: 1 });
      return;
    }
    child.stdout?.on('data', appendOutput);
    child.stderr?.on('data', appendOutput);
    child.once('error', () => finish({ reason: 'START_FAILED', status: 1 }));
    if (child.stdin) {
      child.stdin.on('error', () => {
        terminate();
        finish({ reason: 'START_FAILED', status: 1 });
      });
      child.stdin.end(options.input);
    }
    child.once('close', (code, signal) => {
      finish({ reason: signal ? 'SIGNALLED' : 'EXITED', status: code ?? 1 });
    });
    timer = setTimeout(() => {
      terminate();
      finish({ reason: 'DEADLINE_EXCEEDED', status: 1 });
    }, options.timeoutMs);
  });
}
