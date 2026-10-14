export function runDirectLineLinkMigration(
  execute?: typeof import('./migration-process.mjs').runMigrationProcess,
  environment?: NodeJS.ProcessEnv,
  confirm?: (expectedPhrase: string) => Promise<string>,
): Promise<number>;
