export type MigrationProcessResult = {
  reason: 'START_FAILED' | 'SIGNALLED' | 'EXITED' | 'DEADLINE_EXCEEDED';
  status: number;
  /** Present only when explicitly requested; callers must never log raw output. */
  capturedOutput?: string;
};
export type MigrationProcessOptions = {
  cwd: URL;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  input?: string;
  captureOutput?: boolean;
};
export function runMigrationProcess(
  command: string,
  args: string[],
  options: MigrationProcessOptions,
): Promise<MigrationProcessResult>;
