import type { MigrationProcessResult } from './migration-process.mjs';
export function readReleasePrismaDiagnostic(
  output: string,
): { phase: string; diagnostic: string } | undefined;
export function runReleasePrismaCommand(
  args: string[],
  environment?: NodeJS.ProcessEnv,
  execute?: (
    executable: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv; input?: string },
  ) => Promise<MigrationProcessResult>,
): Promise<number>;
