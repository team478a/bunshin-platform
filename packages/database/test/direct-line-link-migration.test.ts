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
const manaberuDynamicLearningMigrations = [
  '20261017100000_personal_learning_topics_persona_examples',
  '20261017120000_personal_learning_topic_scope',
  '20261017130000_personal_learning_goal_topic_scope',
  '20261017140000_personal_learning_persona_suppressions',
  '20261018100000_personal_learning_persona_opt_in',
  '20261018120000_personal_learning_line_inbox',
];
const manaberuDynamicLearningPendingOutput =
  'The following migration(s) have not yet been applied:\n' +
  manaberuDynamicLearningMigrations.join('\n') +
  '\n';
const manaberuLearningNudgePendingOutput =
  'The following migration(s) have not yet been applied:\n' +
  '20261019100000_personal_learning_nudges\n';
const releaseMigrations = [
  '20261019120000_learning_provider_abstraction',
  '20261020100000_personal_learning_tool_feature_updates',
  '20261020120000_ops_morning_digest_runs',
];
const releasePendingOutput =
  'The following migration(s) have not yet been applied:\n' + releaseMigrations.join('\n') + '\n';

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

  it('does not allow another approved migration set through the nudge-only entrypoint', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 1,
        capturedOutput: richMenuPendingOutput,
      });
    const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

    expect(
      await runDirectLineLinkMigration(
        execute,
        { ...environment, DIRECT_MIGRATION_ALLOWED_SET_ID: 'manaberu-learning-nudges' },
        confirm,
      ),
    ).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
    expect(execute.mock.calls.some(([, args]) => args.includes('deploy'))).toBe(false);
  });

  it('approves only the exact six Manaberu dynamic-learning migrations with a dedicated confirmation', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 1,
        capturedOutput: manaberuDynamicLearningPendingOutput,
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
      'APPLY_MANABERU_DYNAMIC_LEARNING_MIGRATIONS_TO_vtkzinaudznwbsjoyszk',
    );
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls[2]![1]).toContain('migrate');
    expect(execute.mock.calls[2]![1]).toContain('deploy');
    expect(vi.mocked(console.log).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('approves only the exact Manaberu learning-nudge migration with a dedicated confirmation', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 1,
        capturedOutput: manaberuLearningNudgePendingOutput,
      })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 0,
        capturedOutput: 'Database schema is up to date!',
      });
    const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

    expect(
      await runDirectLineLinkMigration(
        execute,
        { ...environment, DIRECT_MIGRATION_ALLOWED_SET_ID: 'manaberu-learning-nudges' },
        confirm,
      ),
    ).toBe(0);
    expect(confirm).toHaveBeenCalledWith(
      'APPLY_MANABERU_LEARNING_NUDGE_MIGRATION_TO_vtkzinaudznwbsjoyszk',
    );
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls[2]![1]).toContain('migrate');
    expect(execute.mock.calls[2]![1]).toContain('deploy');
    expect(vi.mocked(console.log).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it.each([
    ['partial set', ''],
    ['extra migration', manaberuLearningNudgePendingOutput + '20261018999999_unexpected\n'],
  ])(
    'rejects a %s in the Manaberu nudge migration set without confirmation or deploy',
    async (_label, names) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const execute = vi
        .fn<typeof runMigrationProcess>()
        .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
        .mockResolvedValueOnce({
          reason: 'EXITED',
          status: 1,
          capturedOutput: 'The following migration(s) have not yet been applied:\n' + names,
        });
      const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

      expect(
        await runDirectLineLinkMigration(
          execute,
          { ...environment, DIRECT_MIGRATION_ALLOWED_SET_ID: 'manaberu-learning-nudges' },
          confirm,
        ),
      ).toBe(1);
      expect(execute).toHaveBeenCalledTimes(2);
      expect(confirm).not.toHaveBeenCalled();
      expect(execute.mock.calls.some(([, args]) => args.includes('deploy'))).toBe(false);
    },
  );

  it('does not deploy the Manaberu set when its dedicated confirmation is incorrect', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 1,
        capturedOutput: manaberuDynamicLearningPendingOutput,
      });
    const confirm = vi.fn(() =>
      Promise.resolve('APPLY_AI_TRAINING_ENROLLMENT_MIGRATIONS_TO_vtkzinaudznwbsjoyszk'),
    );

    expect(await runDirectLineLinkMigration(execute, environment, confirm)).toBe(1);
    expect(confirm).toHaveBeenCalledWith(
      'APPLY_MANABERU_DYNAMIC_LEARNING_MIGRATIONS_TO_vtkzinaudznwbsjoyszk',
    );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.some(([, args]) => args.includes('deploy'))).toBe(false);
  });

  it.each([
    ['partial set', manaberuDynamicLearningMigrations.slice(0, -1).join('\n') + '\n'],
    [
      'extra migration',
      manaberuDynamicLearningMigrations.join('\n') + '\n20261018999999_unexpected\n',
    ],
  ])(
    'rejects a %s in the Manaberu migration set without confirmation or deploy',
    async (_label, names) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const execute = vi
        .fn<typeof runMigrationProcess>()
        .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
        .mockResolvedValueOnce({
          reason: 'EXITED',
          status: 1,
          capturedOutput: 'The following migration(s) have not yet been applied:\n' + names,
        });
      const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

      expect(await runDirectLineLinkMigration(execute, environment, confirm)).toBe(1);
      expect(execute).toHaveBeenCalledTimes(2);
      expect(confirm).not.toHaveBeenCalled();
      expect(execute.mock.calls.some(([, args]) => args.includes('deploy'))).toBe(false);
    },
  );

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

  it('approves only the exact three migrations in the 2026-10-20 release set', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 1, capturedOutput: releasePendingOutput })
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 0,
        capturedOutput: 'Database schema is up to date!',
      });
    const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

    expect(
      await runDirectLineLinkMigration(
        execute,
        { ...environment, DIRECT_MIGRATION_ALLOWED_SET_ID: 'release-20261020' },
        confirm,
      ),
    ).toBe(0);
    expect(confirm).toHaveBeenCalledWith(
      'APPLY_RELEASE_20261020_MIGRATIONS_TO_vtkzinaudznwbsjoyszk',
    );
    expect(execute.mock.calls[2]![1]).toContain('deploy');
  });

  it.each([
    ['two pending migrations', releaseMigrations.slice(0, 2).join('\n') + '\n'],
    [
      'four pending migrations',
      [...releaseMigrations, '20261020130000_unexpected'].join('\n') + '\n',
    ],
    ['an unrelated migration', '20261020130000_unexpected\n'],
  ])('rejects %s for the release set without confirmation or deploy', async (_label, names) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi
      .fn<typeof runMigrationProcess>()
      .mockResolvedValueOnce({ reason: 'EXITED', status: 0 })
      .mockResolvedValueOnce({
        reason: 'EXITED',
        status: 1,
        capturedOutput: 'The following migration(s) have not yet been applied:\n' + names,
      });
    const confirm = vi.fn((phrase: string) => Promise.resolve(phrase));

    expect(
      await runDirectLineLinkMigration(
        execute,
        { ...environment, DIRECT_MIGRATION_ALLOWED_SET_ID: 'release-20261020' },
        confirm,
      ),
    ).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
    expect(execute.mock.calls.some(([, args]) => args.includes('deploy'))).toBe(false);
  });
});
