import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function resolveMigrationDirectUrl(directUrl, sessionPoolerHost) {
  const url = new URL(directUrl);
  const projectMatch = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);

  if (!projectMatch) {
    return directUrl;
  }

  if (!sessionPoolerHost) {
    throw new Error(
      'SUPABASE_SESSION_POOLER_HOST is required when DIRECT_URL uses the Supabase direct host.',
    );
  }

  const projectRef = projectMatch[1];
  const username = decodeURIComponent(url.username);

  url.hostname = sessionPoolerHost;
  url.port = '5432';
  url.username = username.endsWith(`.${projectRef}`) ? username : `${username}.${projectRef}`;

  return url.toString();
}

export function runVercelMigration(environment = process.env) {
  if (environment.VERCEL_ENV !== 'production') {
    console.log(
      `[database] Skipping migrations for Vercel environment: ${environment.VERCEL_ENV ?? 'local'}`,
    );
    return 0;
  }

  const missingVariables = ['DATABASE_URL', 'DIRECT_URL'].filter((name) => !environment[name]);

  if (missingVariables.length > 0) {
    console.error(`[database] Production migrations require: ${missingVariables.join(', ')}`);
    return 1;
  }

  console.log('[database] Applying production migrations before the Vercel build.');

  let migrationDirectUrl;

  try {
    migrationDirectUrl = resolveMigrationDirectUrl(
      environment.DIRECT_URL,
      environment.SUPABASE_SESSION_POOLER_HOST,
    );
  } catch (error) {
    console.error(
      `[database] Cannot configure the production migration connection: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return 1;
  }

  const pnpmExecutable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(pnpmExecutable, ['--filter', '@bunshin/database', 'db:migrate:deploy'], {
    cwd: new URL('../../..', import.meta.url),
    env: {
      ...environment,
      DIRECT_URL: migrationDirectUrl,
    },
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[database] Failed to start Prisma migrate deploy: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  process.exitCode = runVercelMigration();
}
