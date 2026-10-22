import { afterEach, describe, expect, it, vi } from 'vitest';
import { runRelease20261020Migration } from '../scripts/apply-release-20261020.mjs';
import type { runMigrationProcess } from '../scripts/migration-process.mjs';
import { runMigrationProcess as executeMigrationProcess } from '../scripts/migration-process.mjs';

const projectRef = 'vtkzinaudznwbsjoyszk';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const env = {
  VERCEL_ENV: 'production',
  MIGRATION_APPLY_EXPECTED_PROJECT_REF: projectRef,
  MIGRATION_APPLY_CONFIRMATION: `APPLY_RELEASE_20261020_MIGRATIONS_TO_${projectRef}`,
  DATABASE_URL: `postgresql://postgres.${projectRef}:synthetic-secret@${host}:6543/postgres`,
  DIRECT_URL: `postgresql://postgres:synthetic-secret@db.${projectRef}.supabase.co:5432/postgres`,
  SUPABASE_SESSION_POOLER_HOST: host,
  PGOPTIONS: '-c statement_timeout=0',
  PGSERVICE: 'unexpected-service',
};

describe('approval-gated native psql release', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves the safe client error when a rejected connection closes stdin before a large script is written', async () => {
    const result = await executeMigrationProcess(
      process.execPath,
      ['-e', "process.stderr.write('P1000 authentication failed'); process.exit(1);"],
      {
        cwd: new URL('../', import.meta.url),
        env: process.env,
        timeoutMs: 5000,
        input: 'x'.repeat(1024 * 1024),
      },
    );
    expect(result.status).toBe(1);
    expect(result.diagnostic).toBe('database-authentication-failed');
    expect(result.capturedOutput).toBeUndefined();
  });

  it('defaults to Preview, uses environment credentials, and does not invoke resolve', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue({
      reason: 'EXITED',
      status: 0,
      capturedOutput: 'RELEASE_PSQL_PREVIEW_VERIFIED\n',
    });
    expect(await runRelease20261020Migration(execute, env)).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    const [command, args, options] = execute.mock.calls[0]!;
    expect(command).toBe('psql');
    expect(args.join(' ')).not.toContain('synthetic-secret');
    expect(options.env.PGHOST).toBe(host);
    expect(options.env.PGPORT).toBe('5432');
    expect(options.env.PGPASSWORD).toBe('synthetic-secret');
    expect(options.env.PGSSLMODE).toBe('verify-full');
    expect(options.env.PGSSLROOTCERT).toBeTruthy();
    const metadata = new URL(options.env.DIRECT_URL!);
    expect(metadata.searchParams.get('sslcert')).toBe(options.env.PGSSLROOTCERT);
    expect(metadata.searchParams.get('sslaccept')).toBe('strict');
    expect(options.env.PGOPTIONS).toBeUndefined();
    expect(options.env.PGSERVICE).toBeUndefined();
    expect(options.input).toContain('SET lock_timeout');
    expect(options.input).not.toContain("'resolve' '" + process.execPath);
    expect(options.input).not.toContain('pg_stat_ssl');
  });

  it.each([
    { MIGRATION_APPLY_CONFIRMATION: 'wrong' },
    { MIGRATION_APPLY_EXPECTED_PROJECT_REF: 'wrong' },
    { MIGRATION_APPLY_MODE: 'invalid' },
    { DIRECT_URL: '' },
    { SUPABASE_SESSION_POOLER_HOST: 'wrong.example.com' },
    { DIRECT_URL: env.DIRECT_URL + '?sslmode=disable' },
  ])('fails closed before connecting for invalid configuration %j', async (overrides) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await runRelease20261020Migration(execute, { ...env, ...overrides })).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('does not accept process exit 0 without the final verification marker', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValue({ reason: 'EXITED', status: 0 });
    expect(
      await runRelease20261020Migration(execute, { ...env, MIGRATION_APPLY_MODE: 'apply' }),
    ).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('uses the same validated host and public schema for native SQL and Prisma metadata', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue({
      reason: 'EXITED',
      status: 0,
      capturedOutput: 'RELEASE_PSQL_PREVIEW_VERIFIED\n',
    });
    expect(
      await runRelease20261020Migration(execute, {
        ...env,
        DIRECT_URL: env.DIRECT_URL + '?host=untrusted.example&schema=other',
      }),
    ).toBe(0);
    const settings = execute.mock.calls[0]![2].env;
    const resolver = new URL(settings.DIRECT_URL!);
    expect(settings.PGHOST).toBe(host);
    expect(resolver.hostname).toBe(host);
    expect(resolver.searchParams.has('host')).toBe(false);
    expect(resolver.searchParams.get('schema')).toBe('public');
    expect(resolver.searchParams.get('sslaccept')).toBe('strict');
    expect(resolver.searchParams.get('sslcert')).toBe(settings.PGSSLROOTCERT);
  });

  it('reports only a fixed metadata detail and preserves the committed-SQL warning', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue({
      reason: 'EXITED',
      status: 1,
      diagnostic: 'release-sql-committed-history-unconfirmed',
      capturedOutput: 'RELEASE_PRISMA_RESOLVE_FAILED:database-tls-failure\nsecret raw details',
    });
    expect(
      await runRelease20261020Migration(execute, { ...env, MIGRATION_APPLY_MODE: 'apply' }),
    ).toBe(1);
    const output = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(output).toContain('phase=resolve; reason=database-tls-failure');
    expect(output).toContain('release-sql-committed-history-unconfirmed');
    expect(output).not.toContain('secret raw details');
  });

  it('rejects the expired pinned CA before opening a connection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2032-01-01'));
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await runRelease20261020Migration(execute, env)).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toContain(
      'release-ca-certificate-invalid',
    );
  });
});
