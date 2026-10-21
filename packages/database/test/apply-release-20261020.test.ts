import { afterEach, describe, expect, it, vi } from 'vitest';
import { runRelease20261020Migration } from '../scripts/apply-release-20261020.mjs';
import type { runMigrationProcess } from '../scripts/migration-process.mjs';

const projectRef = 'vtkzinaudznwbsjoyszk';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const direct = `postgresql://postgres:synthetic-secret@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;
const pooledDatabase = `postgresql://postgres.${projectRef}:synthetic-secret@${host}:6543/postgres?sslmode=require`;
const env = {
  VERCEL_ENV: 'production',
  MIGRATION_APPLY_EXPECTED_PROJECT_REF: projectRef,
  MIGRATION_APPLY_CONFIRMATION: `APPLY_RELEASE_20261020_MIGRATIONS_TO_${projectRef}`,
  DATABASE_URL: pooledDatabase,
  DIRECT_URL: direct,
  SUPABASE_SESSION_POOLER_HOST: host,
};
const migrations = [
  '20261019120000_learning_provider_abstraction',
  '20261020100000_personal_learning_tool_feature_updates',
  '20261020120000_ops_morning_digest_runs',
];
const pending =
  'The following migration(s) have not yet been applied:\n' + migrations.join('\n') + '\n';

describe('approval-gated 2026-10-20 release migrations', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requires active bounded session-pooler connection, exact pending set, and verifies after deploy', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 1, capturedOutput: pending })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 0,
        capturedOutput: 'Database schema is up to date!',
      });

    expect(await runRelease20261020Migration(execute, env)).toBe(0);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls[0]![2].input).toContain('BEGIN READ ONLY');
    expect(execute.mock.calls[0]![2].input).toContain('statement_timeout');
    expect(new URL(execute.mock.calls[0]![2].env.DIRECT_URL!).hostname).toBe(host);
    expect(
      new URL(execute.mock.calls[0]![2].env.DIRECT_URL!).searchParams.get('options'),
    ).toContain('lock_timeout=5000');
    expect(execute.mock.calls[2]![1]).toContain('deploy');
    expect(vi.mocked(console.log).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('rejects an unconfirmed action before connecting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(
      await runRelease20261020Migration(execute, {
        ...env,
        MIGRATION_APPLY_CONFIRMATION: 'wrong',
      }),
    ).toBe(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ['partial set', migrations.slice(0, 2)],
    ['unexpected set', [...migrations, '20261020130000_unexpected']],
  ])('rejects a %s without running migrate deploy', async (_label, names) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 1,
        capturedOutput:
          'The following migration(s) have not yet been applied:\n' + names.join('\n'),
      });
    expect(await runRelease20261020Migration(execute, env)).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.some(([, args]) => args.includes('deploy'))).toBe(false);
  });

  it.each([
    [
      'pooler host mismatch',
      {
        DIRECT_URL: direct
          .replace(`db.${projectRef}.supabase.co`, 'other.pooler.supabase.com')
          .replace('postgres:', `postgres.${projectRef}:`),
      },
      'session-pooler-host-mismatch',
    ],
    [
      'TLS disabled',
      { DIRECT_URL: direct.replace('sslmode=require', 'sslmode=disable') },
      'tls-mode-invalid',
    ],
    [
      'missing password',
      { DIRECT_URL: direct.replace('postgres:synthetic-secret@', 'postgres:@') },
      'password-missing',
    ],
  ])('reports only the safe reason for %s before connecting', async (_label, overrides, reason) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await runRelease20261020Migration(execute, { ...env, ...overrides })).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    const diagnostic = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(diagnostic).toContain(`session-pooler-target-invalid:${reason}`);
    expect(diagnostic).not.toContain('synthetic-secret');
  });

  it('accepts a session pooler URL using verify-full TLS', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 1, capturedOutput: pending })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 0,
        capturedOutput: 'Database schema is up to date!',
      });

    expect(
      await runRelease20261020Migration(execute, {
        ...env,
        DIRECT_URL: direct.replace('sslmode=require', 'sslmode=verify-full'),
      }),
    ).toBe(0);
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('fails closed when DIRECT_URL is missing before connecting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await runRelease20261020Migration(execute, { ...env, DIRECT_URL: '' })).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toContain(
      'connection-url-missing',
    );
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });
});
