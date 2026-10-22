import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { diagnoseReleaseAuth } from '../scripts/diagnose-release-auth-20261020.mjs';
import { probeReleaseAuth, type ProbeClient } from '../scripts/probe-release-auth-client.mjs';
import type { runMigrationProcess } from '../scripts/migration-process.mjs';

const project = 'vtkzinaudznwbsjoyszk';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const env = {
  VERCEL_ENV: 'production',
  RELEASE_AUTH_EXPECTED_PROJECT_REF: project,
  RELEASE_AUTH_CONFIRMATION: `DIAGNOSE_RELEASE_20261020_AUTH_TO_${project}`,
  DIRECT_URL: `postgresql://postgres:synthetic-secret@db.${project}.supabase.co:5432/postgres`,
  DATABASE_URL: `postgresql://postgres.${project}:synthetic-secret@${host}:6543/postgres`,
  SUPABASE_SESSION_POOLER_HOST: host,
  PGOPTIONS: '-c statement_timeout=0',
};
const passed = {
  reason: 'EXITED' as const,
  status: 0,
  capturedOutput: 'RELEASE_AUTH_CONNECTION_VERIFIED\n',
};

describe('scoped authentication comparison', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses identical DIRECT_URL credentials and verified CA, preserving each port, once sequentially', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    let active = 0;
    let maximum = 0;
    const execute = vi.fn<typeof runMigrationProcess>().mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return passed;
    });
    expect(
      await diagnoseReleaseAuth(execute, {
        ...env,
        DIRECT_URL:
          env.DIRECT_URL + '?schema=other&host=untrusted.example&sslcert=/wrong&pgbouncer=true',
      }),
    ).toBe(0);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(maximum).toBe(1);
    execute.mock.calls.forEach(([command, args, options], index) => {
      expect(command).toBe(process.execPath);
      expect(args).toHaveLength(1);
      expect(args[0]).toMatch(/probe-release-auth-client\.mjs$/);
      expect(args.join(' ')).not.toContain('synthetic-secret');
      expect(options.timeoutMs).toBe(30000);
      const url = new URL(options.env.DATABASE_URL!);
      expect(url.hostname).toBe(host);
      expect(url.port).toBe(index === 0 ? '5432' : '6543');
      expect(decodeURIComponent(url.username)).toBe(`postgres.${project}`);
      expect(url.password).toBe('synthetic-secret');
      expect(url.searchParams.get('sslaccept')).toBe('strict');
      expect(url.searchParams.get('sslcert')).toMatch(/supabase-prod-ca-2021\.crt$/);
      expect(url.searchParams.get('schema')).toBe('public');
      expect(url.searchParams.has('host')).toBe(false);
      expect(url.searchParams.get('pgbouncer')).toBe(index === 0 ? null : 'true');
      expect(options.env.PGOPTIONS).toBeUndefined();
    });
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain('REFERENCE: MATCH');
  });

  it('reports only a mismatch, never switches to DATABASE_URL credentials or logs their value', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue(passed);
    expect(
      await diagnoseReleaseAuth(execute, {
        ...env,
        DATABASE_URL: env.DATABASE_URL.replace('synthetic-secret', 'different-synthetic-secret'),
      }),
    ).toBe(0);
    const output = vi.mocked(console.log).mock.calls.flat().join('\n');
    expect(output).toContain('REFERENCE: DIFFERENT');
    expect(output).not.toContain('synthetic-secret');
    for (const call of execute.mock.calls)
      expect(new URL(call[2].env.DATABASE_URL!).password).toBe('synthetic-secret');
  });

  it('compares decoded passwords without changing their encoded values', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue(passed);
    expect(
      await diagnoseReleaseAuth(execute, {
        ...env,
        DIRECT_URL: env.DIRECT_URL.replace('synthetic-secret', 'p%40ss%3Aword'),
        DATABASE_URL: env.DATABASE_URL.replace('synthetic-secret', 'p%40ss:word'),
      }),
    ).toBe(0);
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain('REFERENCE: MATCH');
    expect(decodeURIComponent(new URL(execute.mock.calls[0]![2].env.DATABASE_URL!).password)).toBe(
      'p@ss:word',
    );
  });

  it.each([
    { VERCEL_ENV: 'preview' },
    { RELEASE_AUTH_CONFIRMATION: 'wrong' },
    { RELEASE_AUTH_EXPECTED_PROJECT_REF: 'different' },
    { SUPABASE_SESSION_POOLER_HOST: 'untrusted.example' },
    { DIRECT_URL: '' },
    { DATABASE_URL: '' },
    { DIRECT_URL: env.DIRECT_URL.replace(project, 'abcdefghijklmnopqrst') },
    { DATABASE_URL: env.DATABASE_URL.replace(project, 'abcdefghijklmnopqrst') },
    { DIRECT_URL: env.DIRECT_URL.replace('/postgres', '/other') },
    { DIRECT_URL: env.DIRECT_URL.replace('postgres:', 'other:') },
    { DIRECT_URL: env.DIRECT_URL.replace(':5432', ':9999') },
    { DIRECT_URL: env.DIRECT_URL + '?sslmode=disable' },
    { DATABASE_URL: env.DATABASE_URL + '?sslaccept=accept_invalid_certs' },
    { DIRECT_URL: env.DIRECT_URL.replace('synthetic-secret', '') },
  ])('rejects invalid configuration before either connection: %j', async (overrides) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await diagnoseReleaseAuth(execute, { ...env, ...overrides })).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it.each([
    { reason: 'EXITED' as const, status: 0 },
    { reason: 'DEADLINE_EXCEEDED' as const, status: 1 },
    {
      reason: 'EXITED' as const,
      status: 1,
      capturedOutput:
        'RELEASE_PRISMA_PROBE_FAILED:database-authentication-failed\npostgresql://owner:synthetic-secret@host/db',
    },
  ])('records a bounded failed probe and performs no retries: %j', async (failure) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(passed);
    expect(await diagnoseReleaseAuth(execute, env)).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    const output = vi.mocked(console.log).mock.calls.flat().join('\n');
    expect(output).toContain('verified=1/2');
    expect(output).not.toContain('synthetic-secret');
    expect(output).not.toContain('postgresql://');
  });

  it('rejects expired CA before connecting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2032-01-01'));
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await diagnoseReleaseAuth(execute, env)).toBe(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps the workflow manually approved and free of migration/secret mutations', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/diagnose-production-db-auth.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('group: production-migration-apply');
    expect(workflow).not.toMatch(/db:migrate|migrate resolve|migrate deploy|gh secret set/);
  });
});

describe('read-only Prisma Client authentication probe', () => {
  afterEach(() => vi.restoreAllMocks());
  const transaction = () => ({
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ verified: true }]),
  });

  it('sets READ ONLY before the fixed identity SELECT and always disconnects', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const tx = transaction();
    const client: ProbeClient = {
      $connect: vi.fn().mockResolvedValue(undefined),
      $transaction: vi
        .fn<ProbeClient['$transaction']>()
        .mockImplementation(async (work) => work(tx)),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    expect(await probeReleaseAuth(env, () => client)).toBe(0);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(tx.$queryRawUnsafe.mock.calls[0]![0]).toMatch(/^SELECT current_database/);
    expect(tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$queryRawUnsafe.mock.invocationCallOrder[0]!,
    );
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('refuses a wrong identity or non-read-only transaction', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const tx = transaction();
    tx.$queryRawUnsafe.mockResolvedValue([{ verified: false }]);
    const client: ProbeClient = {
      $connect: vi.fn().mockResolvedValue(undefined),
      $transaction: async (work) => work(tx),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    expect(await probeReleaseAuth(env, () => client)).toBe(1);
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toContain(
      'database-access-denied',
    );
  });

  it('preserves the authentication error even if cleanup also fails, without raw details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client: ProbeClient = {
      $connect: vi.fn().mockRejectedValue({
        errorCode: 'P1000',
        message: 'postgresql://owner:synthetic-secret@host/db',
      }),
      $transaction: vi.fn(),
      $disconnect: vi.fn().mockRejectedValue(new Error('synthetic-cleanup-secret')),
    };
    expect(await probeReleaseAuth(env, () => client)).toBe(1);
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toBe(
      'RELEASE_PRISMA_PROBE_FAILED:database-authentication-failed',
    );
  });

  it('does not accept success if disconnect fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const tx = transaction();
    expect(
      await probeReleaseAuth(env, () => ({
        $connect: vi.fn().mockResolvedValue(undefined),
        $transaction: async (work) => work(tx),
        $disconnect: vi.fn().mockRejectedValue(new Error('synthetic-secret')),
      })),
    ).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toBe(
      'RELEASE_PRISMA_PROBE_FAILED:database-connection-closed',
    );
  });
});
