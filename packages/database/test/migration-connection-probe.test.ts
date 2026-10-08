import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMigrationConnectionProbe } from '../scripts/deploy-migrations-for-vercel.mjs';
import type { runMigrationProcess } from '../scripts/migration-process.mjs';
import type { MigrationProcessResult } from '../scripts/migration-process.mjs';

const project = 'abcdefghijklmnopqrst';
const direct = `postgresql://postgres:synthetic-secret@db.${project}.supabase.co:5432/postgres?sslmode=require`;
const environment = {
  VERCEL_ENV: 'production',
  DATABASE_URL: direct,
  DIRECT_URL: direct,
  SUPABASE_SESSION_POOLER_HOST: 'aws-0-ap-northeast-1.pooler.supabase.com',
  MIGRATION_PROBE_EXPECTED_PROJECT_REF: project,
  PGOPTIONS: '-c statement_timeout=0',
};

describe('migration connection probe only', () => {
  afterEach(() => vi.restoreAllMocks());

  it('succeeds with exactly one read-only settings probe and never migrates', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValue({ reason: 'EXITED', status: 0 });
    expect(await runMigrationConnectionProbe(environment, execute)).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    const [command, args, options] = execute.mock.calls[0]!;
    expect(command).toBe(process.execPath);
    expect(args.slice(1)).toEqual(['db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma']);
    expect(options.input).toMatch(/^BEGIN READ ONLY;/);
    expect(options.input).toContain('MIGRATION_BOUNDS_NOT_ACTIVE');
    expect(options.input).toContain('MIGRATION_PROBE_IDENTITY_MISMATCH');
    expect(options.input).toMatch(/COMMIT;$/);
    expect(options.input).not.toMatch(/CREATE|ALTER|INSERT|UPDATE|DELETE/);
    expect(options.timeoutMs).toBe(300000);
    expect(options.env.DATABASE_URL).toBe(options.env.DIRECT_URL);
    expect(options.env.PGOPTIONS).toBeUndefined();
    const url = new URL(options.env.DIRECT_URL!);
    expect(url.port).toBe('5432');
    expect(decodeURIComponent(url.username)).toBe(`postgres.${project}`);
    expect(url.searchParams.get('options')).toContain('lock_timeout=5000');
    expect(environment.DIRECT_URL).toBe(direct);
    expect(log.mock.calls.flat().join(' ')).toContain('MIGRATION_CONNECTION_PROBE_PASSED');
    expect(log.mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('accepts an existing session pooler and a same-project transaction URL for the app only', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const pooler = `postgresql://postgres.${project}:synthetic-secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require`;
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValue({ reason: 'EXITED', status: 0 });
    expect(
      await runMigrationConnectionProbe(
        { ...environment, DIRECT_URL: pooler, DATABASE_URL: pooler.replace(':5432/', ':6543/') },
        execute,
      ),
    ).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(new URL(execute.mock.calls[0]![2].env.DIRECT_URL!).port).toBe('5432');
  });

  it.each([
    { VERCEL_ENV: 'preview' },
    { VERCEL_ENV: 'development' },
    { VERCEL_ENV: '' },
    { MIGRATION_PROBE_EXPECTED_PROJECT_REF: '' },
    { MIGRATION_PROBE_EXPECTED_PROJECT_REF: 'wrong' },
    { MIGRATION_PROBE_EXPECTED_PROJECT_REF: 'zzzzzzzzzzzzzzzzzzzz' },
    { DATABASE_URL: direct.replace(project, 'zzzzzzzzzzzzzzzzzzzz') },
    { DIRECT_URL: direct.replace(project, 'zzzzzzzzzzzzzzzzzzzz') },
    { DIRECT_URL: direct.replace('postgres:', 'reader:') },
    { DIRECT_URL: direct.replace('/postgres?', '/other?') },
    { SUPABASE_SESSION_POOLER_HOST: 'untrusted.example.com' },
    {
      DIRECT_URL: direct
        .replace(`postgres:`, `postgres.${project}:`)
        .replace(`db.${project}.supabase.co:5432`, 'aws-0-ap-northeast-1.pooler.supabase.com:6543'),
    },
    { DIRECT_URL: 'synthetic-secret' },
    { MIGRATION_LOCK_TIMEOUT_MS: '0' },
  ])('rejects invalid environment/target/bounds before connecting %#', async (override) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await runMigrationConnectionProbe({ ...environment, ...override }, execute)).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(error.mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it.each<MigrationProcessResult>([
    { reason: 'EXITED', status: 1 },
    { reason: 'DEADLINE_EXCEEDED', status: 1 },
    { reason: 'SIGNALLED', status: 1 },
    { reason: 'START_FAILED', status: 1 },
  ])('does not retry or migrate after %j', async (result) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue(result);
    expect(await runMigrationConnectionProbe(environment, execute)).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.flat().join(' ')).toContain('no migrate deploy started');
  });

  it('does not expose executor errors containing secrets', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockRejectedValue(new Error(direct));
    expect(await runMigrationConnectionProbe(environment, execute)).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('the separate CLI fails without credentials and never falls through to deploy', () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../scripts/probe-migration-connection.mjs', import.meta.url))],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          VERCEL_ENV: 'production',
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Production migrations require');
    expect(result.stdout).not.toContain('Applying production migrations');
  });
});
