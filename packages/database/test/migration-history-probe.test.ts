import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseMigrationHistoryStatus,
  runMigrationHistoryProbe,
} from '../scripts/probe-migration-history.mjs';
import type { runMigrationProcess } from '../scripts/migration-process.mjs';

const projectRef = 'vtkzinaudznwbsjoyszk';
const pooler = `postgresql://postgres.${projectRef}:synthetic-secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require`;
const environment = {
  VERCEL_ENV: 'production',
  DATABASE_URL: pooler.replace(':5432/', ':6543/'),
  DIRECT_URL: pooler,
  MIGRATION_PROBE_EXPECTED_PROJECT_REF: projectRef,
  PGOPTIONS: '-c statement_timeout=0',
};

describe('read-only production migration history probe', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses only known pending migration names and never needs raw output in logs', () => {
    expect(
      parseMigrationHistoryStatus(
        'The following migration(s) have not yet been applied:\n20261014090000_add_line_link_attempt_method\n',
        ['20261014090000_add_line_link_attempt_method'],
      ),
    ).toEqual({
      status: 'PENDING',
      pendingMigrations: ['20261014090000_add_line_link_attempt_method'],
    });
    expect(parseMigrationHistoryStatus('Database schema is up to date!')).toEqual({
      status: 'UP_TO_DATE',
      pendingMigrations: [],
    });
    expect(
      parseMigrationHistoryStatus('Following migration(s) have failed:\nsynthetic-secret'),
    ).toEqual({ status: 'NEEDS_REVIEW', pendingMigrations: [] });
    expect(parseMigrationHistoryStatus('synthetic-secret and unknown output')).toEqual({
      status: 'UNKNOWN',
      pendingMigrations: [],
    });
  });

  it('checks exact project identity then reads migration status without changing the database', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 1,
        capturedOutput:
          'The following migration(s) have not yet been applied:\n20261014090000_add_line_link_attempt_method\n',
      });

    expect(await runMigrationHistoryProbe(environment, execute)).toBe(0);
    expect(execute).toHaveBeenCalledTimes(2);
    const identity = execute.mock.calls[0]![2];
    expect(identity.input).toMatch(/^BEGIN READ ONLY;/);
    expect(identity.input).toContain('SET LOCAL statement_timeout');
    expect(identity.input).toContain('current_database()');
    expect(identity.input).toMatch(/COMMIT;$/);
    expect(identity.input).not.toMatch(/CREATE|ALTER|INSERT|UPDATE|DELETE/);
    expect(identity.env.PGOPTIONS).toBeUndefined();

    const history = execute.mock.calls[1]![2];
    expect(execute.mock.calls[1]![1].slice(1)).toEqual([
      'migrate',
      'status',
      '--schema',
      'prisma/schema.prisma',
    ]);
    expect(history.captureOutput).toBe(true);
    expect(history.env.DATABASE_URL).toBe(history.env.DIRECT_URL);
    const historyUrl = new URL(history.env.DIRECT_URL!);
    expect(historyUrl.port).toBe('5432');
    expect(historyUrl.searchParams.has('options')).toBe(false);

    const log = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(log).toContain('pending=1');
    expect(log).toContain('20261014090000_add_line_link_attempt_method');
    expect(log).not.toContain('synthetic-secret');
  });

  it('stops before reading history when identity preflight fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValue({ reason: 'EXITED', status: 1, diagnostic: 'database-identity-mismatch' });
    expect(await runMigrationHistoryProbe(environment, execute)).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('rejects cross-project credentials before connecting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(
      await runMigrationHistoryProbe(
        { ...environment, DIRECT_URL: pooler.replace(projectRef, 'abcdefghijklmnopqrst') },
        execute,
      ),
    ).toBe(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not treat a timeout as a successful history read even if output was partial', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const partialPending =
      'The following migration(s) have not yet been applied:\n20261014090000_add_line_link_attempt_method\n';
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'DEADLINE_EXCEEDED',
        status: 1,
        capturedOutput: partialPending,
      });
    expect(await runMigrationHistoryProbe(environment, execute)).toBe(1);
  });
});
