export type MigrationProcessResult = {
  reason: 'START_FAILED' | 'SIGNALLED' | 'EXITED' | 'DEADLINE_EXCEEDED';
  status: number;
  /** Fixed allowlisted label only; never raw child output. */
  diagnostic?: string;
};
export type MigrationProcessOptions = {
  cwd: URL;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  input?: string;
};
export function runMigrationProcess(
  command: string,
  args: string[],
  options: MigrationProcessOptions,
): Promise<MigrationProcessResult>;
export function classifyMigrationProcessFailure(output: string): string | undefined;
