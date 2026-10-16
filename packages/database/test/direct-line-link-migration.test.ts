import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDirectLineLinkMigration } from '../scripts/apply-line-link-migrations.mjs';
import type { runMigrationProcess } from '../scripts/migration-process.mjs';

const projectRef = 'vtkzinaudznwbsjoyszk';
const connection = `postgresql://postgres:synthetic-secret@db.${projectRef}.supabase.co:5432/postgres?sslmode=require&connect_timeout=10`;
const environment = { DATABASE_URL: connection, DIRECT_URL: connection };
const pendingOutput =
  'The following migration(s) have not yet been applied:\n' +
  '20261014090000_add_line_link_attempt_method\n' +
  '20261014091000_allow_line_link_attempt_method\n';
const richMenuPendingOutput =
  'The following migration(s) have not yet been applied:\n' +
  '20261015090000_personal_learning_rich_menu_pending\n';
const lineFollowInvitationPendingOutput =
  'The following migration(s) have not yet been applied:\n' +
  '20261015170000_add_line_follow_invitations\n';
const aiTrainingEnrollmentPendingOutput =
  'The following migration(s) have not yet been applied:\n' +
  '20261016120000_ai_training_usage_consent\n' +
  '20261016150000_invitation_manual_service_registration\n';

describe('direct, approval-gated production migration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('checks the direct target and exact pending set before the explicit confirmation and deploy', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 0,
        capturedOutput: pendingOutput,
      })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 0,
        capturedOutput: 'Database schema is up to date!',
      });
    const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

    expect(await runDirectLineLinkMigration(execute, environment, confirm)).toBe(0);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls[0]![1].slice(1)).toEqual([
      'db',
      'execute',
      '--stdin',
      '--schema',
      'prisma/schema.prisma',
    ]);
    expect(execute.mock.calls[0]![2].input).toContain('BEGIN READ ONLY');
    expect(execute.mock.calls[0]![2].input).toContain('MIGRATION');
    expect(execute.mock.calls[1]![1].slice(1)).toEqual([
      'migrate',
      'status',
      '--schema',
      'prisma/schema.prisma',
    ]);
    expect(
      new URL(execute.mock.calls[0]![2].env.DIRECT_URL!).searchParams.get('options'),
    ).toContain('lock_timeout=5000');
    expect(execute.mock.calls[2]![1].slice(1)).toEqual([
      'migrate',
      'deploy',
      '--schema',
      'prisma/schema.prisma',
    ]);
    expect(confirm).toHaveBeenCalledWith('APPLY_TWO_LINE_LINK_MIGRATIONS_TO_vtkzinaudznwbsjoyszk');
    expect(vi.mocked(console.log).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('does not deploy if confirmation is missing or incorrect', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 1, capturedOutput: pendingOutput });

    expect(
      await runDirectLineLinkMigration(execute, environment, () => Promise.resolve('no')),
    ).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.some(([, args]) => args.includes('deploy'))).toBe(false);
  });

  it('approves only the exact single nullable rich-menu migration with its own confirmation', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 1, capturedOutput: richMenuPendingOutput })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 0,
        capturedOutput: 'Database schema is up to date!',
      });
    const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

    expect(await runDirectLineLinkMigration(execute, environment, confirm)).toBe(0);
    expect(confirm).toHaveBeenCalledWith(
      'APPLY_PERSONAL_LEARNING_RICH_MENU_MIGRATION_TO_vtkzinaudznwbsjoyszk',
    );
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls[1]![2].captureOutput).toBe(true);
    expect(execute.mock.calls[2]![1]).toContain('migrate');
    expect(execute.mock.calls[2]![1]).toContain('deploy');
  });

  it('approves only the exact LINE follow invitation migration with its own confirmation', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 1,
        capturedOutput: lineFollowInvitationPendingOutput,
      })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 0,
        capturedOutput: 'Database schema is up to date!',
      });
    const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

    expect(await runDirectLineLinkMigration(execute, environment, confirm)).toBe(0);
    expect(confirm).toHaveBeenCalledWith(
      'APPLY_LINE_FOLLOW_INVITATIONS_MIGRATION_TO_vtkzinaudznwbsjoyszk',
    );
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls[2]![1]).toContain('migrate');
    expect(execute.mock.calls[2]![1]).toContain('deploy');
  });

  it('approves only the exact AI training enrollment migrations with their own confirmation', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 1,
        capturedOutput: aiTrainingEnrollmentPendingOutput,
      })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 0,
        capturedOutput: 'Database schema is up to date!',
      });
    const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

    expect(await runDirectLineLinkMigration(execute, environment, confirm)).toBe(0);
    expect(confirm).toHaveBeenCalledWith(
      'APPLY_AI_TRAINING_ENROLLMENT_MIGRATIONS_TO_vtkzinaudznwbsjoyszk',
    );
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls[2]![1]).toContain('migrate');
    expect(execute.mock.calls[2]![1]).toContain('deploy');
  });

  it('rejects extra migrations combined with the AI training enrollment set', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 1,
        capturedOutput:
          aiTrainingEnrollmentPendingOutput + '20261015170000_add_line_follow_invitations\n',
      });
    const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

    expect(await runDirectLineLinkMigration(execute, environment, confirm)).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
    expect(execute.mock.calls.some(([, args]) => args.includes('deploy'))).toBe(false);
  });

  it('rejects another target before connecting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();

    expect(
      await runDirectLineLinkMigration(
        execute,
        {
          DATABASE_URL: connection.replace(projectRef, 'abcdefghijklmnopqrst'),
          DIRECT_URL: connection,
        },
        (phrase) => Promise.resolve(phrase),
      ),
    ).toBe(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects unexpected pending migration names without asking to deploy', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 1,
        capturedOutput:
          'The following migration(s) have not yet been applied:\n20261014999999_unexpected\n',
      });
    const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

    expect(await runDirectLineLinkMigration(execute, environment, confirm)).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
  });
});
