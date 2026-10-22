import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyReleaseReadiness } from '../scripts/verify-release-readiness-20261020.mjs';
import type { runMigrationProcess } from '../scripts/migration-process.mjs';

const project = 'vtkzinaudznwbsjoyszk';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const direct = `postgresql://postgres:synthetic-secret@db.${project}.supabase.co:5432/postgres`;
const environment = {
  VERCEL_ENV: 'production',
  RELEASE_READINESS_EXPECTED_PROJECT_REF: project,
  RELEASE_READINESS_CONFIRMATION: `VERIFY_RELEASE_20261020_SCHEMA_TO_${project}`,
  DATABASE_URL: direct,
  SUPABASE_SESSION_POOLER_HOST: host,
  PGOPTIONS: '-c statement_timeout=0',
};
const passed = {
  reason: 'EXITED' as const,
  status: 0,
  capturedOutput: 'Database schema readiness gate passed.\n',
};

describe('read-only production release readiness', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    direct,
    `postgresql://postgres.${project}:synthetic-secret@${host}:5432/postgres`,
    `postgresql://postgres.${project}:synthetic-secret@${host}:6543/postgres`,
  ])(
    'uses the runtime pooler and verified CA for %s without running migrations',
    async (source) => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue(passed);
      expect(
        await verifyReleaseReadiness(execute, {
          ...environment,
          DATABASE_URL:
            source + '?schema=other&host=untrusted.example&sslcert=/wrong&connection_limit=99',
        }),
      ).toBe(0);
      expect(execute).toHaveBeenCalledTimes(1);
      const [command, args, options] = execute.mock.calls[0]!;
      expect(command).toBe('pnpm');
      expect(args).toEqual(['--filter', '@bunshin/database', 'db:assert-ready']);
      expect(args.join(' ')).not.toContain('synthetic-secret');
      expect(options.timeoutMs).toBe(180000);
      const url = new URL(options.env.DATABASE_URL!);
      expect(url.hostname).toBe(host);
      expect(url.port).toBe('6543');
      expect(decodeURIComponent(url.username)).toBe(`postgres.${project}`);
      expect(url.password).toBe('synthetic-secret');
      expect(url.pathname).toBe('/postgres');
      expect(url.searchParams.get('schema')).toBe('public');
      expect(url.searchParams.get('pgbouncer')).toBe('true');
      expect(url.searchParams.get('connection_limit')).toBe('1');
      expect(url.searchParams.get('sslmode')).toBe('require');
      expect(url.searchParams.get('sslaccept')).toBe('strict');
      expect(url.searchParams.get('sslcert')).toMatch(/supabase-prod-ca-2021\.crt$/);
      expect(url.searchParams.has('host')).toBe(false);
      expect(options.env.PGOPTIONS).toBeUndefined();
      expect(environment.DATABASE_URL).toBe(direct);
    },
  );

  it.each([
    { VERCEL_ENV: 'preview' },
    { RELEASE_READINESS_EXPECTED_PROJECT_REF: 'different' },
    { RELEASE_READINESS_CONFIRMATION: 'wrong' },
    { DATABASE_URL: '' },
    { DATABASE_URL: direct.replace(project, 'abcdefghijklmnopqrst') },
    { DATABASE_URL: direct.replace(':5432', ':9999') },
    { DATABASE_URL: direct.replace('/postgres', '/other') },
    { DATABASE_URL: direct.replace('postgres:', 'service:') },
    { DATABASE_URL: direct.replace('synthetic-secret', '') },
    { DATABASE_URL: direct + '?sslmode=disable' },
    { DATABASE_URL: direct + '?sslaccept=accept_invalid_certs' },
    { SUPABASE_SESSION_POOLER_HOST: 'untrusted.example' },
    {
      DATABASE_URL: `postgresql://postgres.${project}:synthetic-secret@other.pooler.supabase.com:6543/postgres`,
    },
  ])('rejects invalid configuration before connecting: %j', async (overrides) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await verifyReleaseReadiness(execute, { ...environment, ...overrides })).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('rejects an expired CA before connecting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2032-01-01'));
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await verifyReleaseReadiness(execute, environment)).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toContain(
      'release-ca-certificate-invalid',
    );
  });

  it.each([
    { reason: 'EXITED' as const, status: 0 },
    { reason: 'EXITED' as const, status: 1, diagnostic: 'database-unreachable' },
    { reason: 'DEADLINE_EXCEEDED' as const, status: 1 },
    {
      reason: 'EXITED' as const,
      status: 1,
      capturedOutput:
        'Production deployment blocked: the database is behind the application schema. postgresql://owner:synthetic-secret@host/db',
    },
  ])('fails closed for %j and never retries or logs raw errors', async (result) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue(result);
    expect(await verifyReleaseReadiness(execute, environment)).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    const output = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(output).not.toContain('synthetic-secret');
    expect(output).not.toContain('postgresql://');
    if (result.capturedOutput) expect(output).toContain('schema-not-ready');
  });

  it('the dedicated workflow only runs the read-only gate behind human approval', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/verify-production-release-20261020.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('group: production-migration-apply');
    expect(workflow).not.toMatch(
      /apply-release-20261020\.mjs|db:migrate|migrate resolve|migrate deploy/,
    );
  });
});
