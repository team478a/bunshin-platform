import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { resolveMigrationDirectUrl } from '../scripts/deploy-migrations-for-vercel.mjs';

const scriptPath = fileURLToPath(
  new URL('../scripts/deploy-migrations-for-vercel.mjs', import.meta.url),
);

function runScript(environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...environment,
    },
  });
}

describe('Vercel production migrations', () => {
  it.each(['preview', 'development'])(
    'does not migrate the %s environment',
    (vercelEnvironment) => {
      const result = runScript({ VERCEL_ENV: vercelEnvironment });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Skipping migrations');
    },
  );

  it('stops a production build when database credentials are missing', () => {
    const result = runScript({
      VERCEL_ENV: 'production',
      DATABASE_URL: '',
      DIRECT_URL: '',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Production migrations require: DATABASE_URL, DIRECT_URL');
  });

  it('uses the IPv4 session pooler for a Supabase direct connection', () => {
    const result = resolveMigrationDirectUrl(
      'postgresql://postgres:encoded%20password@db.projectref.supabase.co:5432/postgres?sslmode=require',
      'aws-0-ap-northeast-1.pooler.supabase.com',
    );
    const url = new URL(result);

    expect(url.hostname).toBe('aws-0-ap-northeast-1.pooler.supabase.com');
    expect(url.port).toBe('5432');
    expect(decodeURIComponent(url.username)).toBe('postgres.projectref');
    expect(decodeURIComponent(url.password)).toBe('encoded password');
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('requires an explicit pooler host for Supabase production credentials', () => {
    expect(() =>
      resolveMigrationDirectUrl(
        'postgresql://postgres:password@db.projectref.supabase.co:5432/postgres',
        undefined,
      ),
    ).toThrow('SUPABASE_SESSION_POOLER_HOST is required');
  });

  it('keeps non-Supabase direct connections unchanged', () => {
    const directUrl = 'postgresql://user:password@database.example.com:5432/app';

    expect(resolveMigrationDirectUrl(directUrl, undefined)).toBe(directUrl);
  });
});
