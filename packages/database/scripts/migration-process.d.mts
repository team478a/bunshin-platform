export type MigrationProcessResult = {
  reason: 'START_FAILED' | 'SIGNALLED' | 'EXITED' | 'DEADLINE_EXCEEDED';
  status: number;
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
