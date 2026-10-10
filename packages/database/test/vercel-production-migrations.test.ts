import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertReleaseMigrationGuard,
  buildReleasePreflightSql,
  resolveMigrationDirectUrl,
  resolveMigrationBounds,
  withMigrationConnectionMetadata,
  runVercelMigration,
} from '../scripts/deploy-migrations-for-vercel.mjs';
import { runMigrationProcess } from '../scripts/migration-process.mjs';
import type { MigrationProcessResult } from '../scripts/migration-process.mjs';

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
  afterEach(() => vi.restoreAllMocks());
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

  it('adds only connection metadata while preserving identity and TLS', () => {
    const url = new URL(
      withMigrationConnectionMetadata(
        'postgresql://test:synthetic@localhost:5432/test?schema=public&sslmode=require&connect_timeout=0',
      ),
    );
    expect(url.searchParams.has('options')).toBe(false);
    expect(url.searchParams.get('connect_timeout')).toBe('10');
    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('application_name')).toBe('bunshin_migration_bounded');
    expect(url.hostname).toBe('localhost');
    expect(url.password).toBe('synthetic');
  });

  it('pins the audited lineage and committed transaction-local target guard', () => {
    const migrationNames = assertReleaseMigrationGuard();
    expect(migrationNames).toHaveLength(232);
    const preflight = buildReleasePreflightSql(migrationNames);
    expect(preflight).toContain('20261010070000_personal_learning_call_cost_reservation');
    expect(preflight).toContain('20261008140000_learning_member_line_link');
    expect(preflight).toContain('successful_count <> 231');
    expect(preflight).toContain('EXCEPT SELECT unnest(expected_names)');
    expect(preflight).toContain('SELECT unnest(expected_names)');
    expect(preflight).toContain('TARGET_MIGRATION_PREFLIGHT_CHANGED');
  });

  it('rejects incomplete or reordered release lineages before building SQL', () => {
    expect(() =>
      buildReleasePreflightSql([
        '20261010070000_personal_learning_call_cost_reservation',
        '20261008140000_learning_member_line_link',
      ]),
    ).toThrow('UNEXPECTED_MIGRATION_LINEAGE');
    expect(() =>
      buildReleasePreflightSql([
        '20261008140000_learning_member_line_link',
        'unsafe-name',
        '20261010070000_personal_learning_call_cost_reservation',
      ]),
    ).toThrow('UNEXPECTED_MIGRATION_LINEAGE');
  });

  it.each(['0', '-1', '1.5', 'NaN', '', ' 5000', '5000ms', '10001', '9007199254740993'])(
    'rejects invalid/unbounded lock timeout %s',
    (value) => {
      expect(() => resolveMigrationBounds({ MIGRATION_LOCK_TIMEOUT_MS: value })).toThrow();
    },
  );
  it.each([
    { MIGRATION_STATEMENT_TIMEOUT_MS: '120001' },
    { MIGRATION_PROCESS_TIMEOUT_MS: '600001' },
    { MIGRATION_STATEMENT_TIMEOUT_MS: '5000' },
    { MIGRATION_PROCESS_TIMEOUT_MS: '60000' },
  ])('rejects oversized or unordered bounds %j', (environment) => {
    expect(() => resolveMigrationBounds(environment)).toThrow();
  });

  it.each([
    'postgresql://test:synthetic@localhost/test?options=-c%20statement_timeout%3D0',
    'postgresql://test:synthetic@localhost/test?options=',
    'https://localhost/test',
  ])('rejects existing startup options or unsupported URL without executing', async (directUrl) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(
      await runVercelMigration(
        { VERCEL_ENV: 'production', DATABASE_URL: directUrl, DIRECT_URL: directUrl },
        execute,
      ),
    ).toBe(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('uses a direct CLI, audited preflight, isolated env and no retry', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const environment = {
      VERCEL_ENV: 'production',
      DATABASE_URL: 'postgresql://test:synthetic@localhost/test',
      DIRECT_URL: 'postgresql://test:synthetic@localhost/test',
      PGOPTIONS: '-c statement_timeout=0',
    };
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValue({ reason: 'EXITED', status: 0 });
    expect(await runVercelMigration(environment, execute)).toBe(0);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]![1].slice(1)).toEqual([
      'db',
      'execute',
      '--stdin',
      '--schema',
      'prisma/schema.prisma',
    ]);
    expect(execute.mock.calls[0]![2].input).toContain('UNEXPECTED_PRE_MIGRATION_HISTORY');
    expect(execute.mock.calls[0]![2].input).toContain(
      'personal_learning_call_admissions_cost_pair_check',
    );
    const [command, args, options] = execute.mock.calls[1]!;
    expect(command).toBe(process.execPath);
    expect(args.slice(1)).toEqual(['migrate', 'deploy']);
    expect(args[0]).toMatch(/prisma.*build[/\\]index\.js$/);
    expect(options.timeoutMs).toBeGreaterThan(0);
    expect(options.timeoutMs).toBeLessThanOrEqual(300000);
    expect(options.env.PGOPTIONS).toBeUndefined();
    expect(new URL(options.env.DIRECT_URL!).searchParams.has('options')).toBe(false);
    expect(new URL(options.env.DIRECT_URL!).searchParams.get('application_name')).toBe(
      'bunshin_migration_bounded',
    );
    expect(environment.DIRECT_URL).not.toContain('lock_timeout');
    expect(environment.PGOPTIONS).toContain('statement_timeout=0');
  });

  it.each<MigrationProcessResult>([
    { reason: 'EXITED', status: 1 },
    { reason: 'DEADLINE_EXCEEDED', status: 1 },
    { reason: 'SIGNALLED', status: 1 },
    { reason: 'START_FAILED', status: 1 },
  ])('fails closed without retry for %j', async (result) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValue(result);
    const url = 'postgresql://test:synthetic-secret@localhost/test';
    expect(
      await runVercelMigration(
        { VERCEL_ENV: 'production', DATABASE_URL: url, DIRECT_URL: url },
        execute,
      ),
    ).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(errorLog.mock.calls.flat().join(' ')).toContain('do not retry automatically');
    expect(errorLog.mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('does not start migrate deploy when the audited preflight fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValue({ reason: 'EXITED', status: 1 });
    const url = 'postgresql://test:synthetic@localhost/test';
    expect(
      await runVercelMigration(
        { VERCEL_ENV: 'production', DATABASE_URL: url, DIRECT_URL: url },
        execute,
      ),
    ).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]![1].slice(1)).toEqual([
      'db',
      'execute',
      '--stdin',
      '--schema',
      'prisma/schema.prisma',
    ]);
    expect(errorLog.mock.calls.flat().join(' ')).toContain('no migrate deploy started');
  });

  it('does not leak an invalid URL or executor exception', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockRejectedValue(new Error('synthetic-secret SQL response'));
    const url = 'postgresql://test:synthetic-secret@localhost/test';
    expect(
      await runVercelMigration(
        { VERCEL_ENV: 'production', DATABASE_URL: url, DIRECT_URL: url },
        execute,
      ),
    ).toBe(1);
    expect(
      await runVercelMigration(
        { VERCEL_ENV: 'production', DATABASE_URL: url, DIRECT_URL: 'synthetic-secret' },
        execute,
      ),
    ).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(errorLog.mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('bounds a real stalled process without exposing its output', async () => {
    const options = { cwd: new URL('../', import.meta.url), env: process.env, timeoutMs: 100 };
    const result = await runMigrationProcess(
      process.execPath,
      ['-e', 'console.error("synthetic-secret"); setInterval(() => {}, 1000)'],
      options,
    );
    expect(result).toEqual({ reason: 'DEADLINE_EXCEEDED', status: 1 });
  });

  it('records a real successful process and a start failure', async () => {
    const options = { cwd: new URL('../', import.meta.url), env: process.env, timeoutMs: 2000 };
    expect(await runMigrationProcess(process.execPath, ['-e', 'process.exit(0)'], options)).toEqual(
      {
        reason: 'EXITED',
        status: 0,
      },
    );
    expect(
      await runMigrationProcess('bunshin-nonexistent-synthetic-executable', [], options),
    ).toEqual({
      reason: 'START_FAILED',
      status: 1,
    });
  });
});
