import { spawn } from 'node:child_process';

const MAX_CAPTURED_OUTPUT_BYTES = 64 * 1024;

/** No raw child output: SQL/errors may contain credentials or application data. */
export function runMigrationProcess(command, args, options) {
  return new Promise((resolve) => {
    let child;
    let timer;
    let settled = false;
    let output = Buffer.alloc(0);
    const appendOutput = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      output = Buffer.concat([output, bytes]).subarray(-MAX_CAPTURED_OUTPUT_BYTES);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Captured output is for an allowlisted parser and must never be logged raw.
      resolve(
        options.captureOutput ? { ...result, capturedOutput: output.toString('utf8') } : result,
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
