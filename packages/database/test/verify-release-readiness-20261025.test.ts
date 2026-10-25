import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyReleaseReadiness20261025 } from '../scripts/verify-release-readiness-20261025.mjs';
import type { runMigrationProcess } from '../scripts/migration-process.mjs';

const project = 'vtkzinaudznwbsjoyszk';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const direct = `postgresql://postgres:synthetic-secret@db.${project}.supabase.co:5432/postgres`;
const environment = {
  VERCEL_ENV: 'production',
  RELEASE_READINESS_EXPECTED_PROJECT_REF: project,
  RELEASE_READINESS_CONFIRMATION: `VERIFY_RELEASE_20261025_SCHEMA_TO_${project}`,
  DATABASE_URL: direct,
  SUPABASE_SESSION_POOLER_HOST: host,
};

describe('HASSY release readiness gate', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs only the read-only schema assertion through the transaction pooler', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue({
      reason: 'EXITED',
      status: 0,
      capturedOutput: 'Database schema readiness gate passed.\n',
    });

    expect(await verifyReleaseReadiness20261025(execute, environment)).toBe(0);
    const [command, args, options] = execute.mock.calls[0]!;
    expect(command).toBe('pnpm');
    expect(args).toEqual(['--filter', '@bunshin/database', 'db:assert-ready']);
    expect(args.join(' ')).not.toContain('synthetic-secret');
    expect(new URL(options.env.DATABASE_URL!).hostname).toBe(host);
  });

  it.each([
    { VERCEL_ENV: 'preview' },
    { RELEASE_READINESS_CONFIRMATION: 'wrong' },
    { RELEASE_READINESS_EXPECTED_PROJECT_REF: 'wrong' },
    { SUPABASE_SESSION_POOLER_HOST: 'wrong.example.com' },
  ])('rejects invalid configuration before connecting: %j', async (overrides) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await verifyReleaseReadiness20261025(execute, { ...environment, ...overrides })).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });
});
