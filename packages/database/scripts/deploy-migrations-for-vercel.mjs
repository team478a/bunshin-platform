import { spawnSync } from 'node:child_process';

const isProduction = process.env.VERCEL_ENV === 'production';

if (!isProduction) {
  console.log(
    `[database] Skipping migrations for Vercel environment: ${process.env.VERCEL_ENV ?? 'local'}`,
  );
  process.exit(0);
}

const missingVariables = ['DATABASE_URL', 'DIRECT_URL'].filter((name) => !process.env[name]);

if (missingVariables.length > 0) {
  console.error(`[database] Production migrations require: ${missingVariables.join(', ')}`);
  process.exit(1);
}

console.log('[database] Applying production migrations before the Vercel build.');

const pnpmExecutable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpmExecutable, ['--filter', '@bunshin/database', 'db:migrate:deploy'], {
  cwd: new URL('../../..', import.meta.url),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[database] Failed to start Prisma migrate deploy: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
