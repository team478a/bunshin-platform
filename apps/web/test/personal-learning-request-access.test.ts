import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const f = vi.hoisted(() => ({
  environment: 'development',
  service: vi.fn(),
  membership: vi.fn(),
  enrollment: vi.fn(),
  program: vi.fn(),
  request: vi.fn(),
  topics: vi.fn(),
  transaction: vi.fn(),
  seat: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: f.environment }) }));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: f.service }));
vi.mock('../src/services/ai-training-consent', () => ({
  requireAiTrainingUsageConsent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    groupMembership: { findFirst: f.membership },
    programEnrollment: { findFirst: f.enrollment },
    serviceProgram: { findFirst: f.program },
    personalLearningRequest: { findFirst: f.request },
    personalLearningTopic: { findMany: f.topics },
    $transaction: f.transaction,
  },
  requirePersonalLearningPilotSeat: f.seat,
}));
import {
  personalLearningRequestEnabled,
  resolvePersonalLearningRequestActor,
} from '../src/services/personal-learning-request-access';
describe('learning request exposure and ownership', () => {
  const enrollmentId = '00000000-0000-4000-8000-000000000001';
  const settings = {
    moduleKey: 'AI_TRAINING_V1',
    trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
    personalLearningPilot: {
      enabled: true,
      enrollmentIds: [enrollmentId],
      learningMode: 'DYNAMIC_V1',
      learningFeatures: {
        conversation: true,
        multiTopic: false,
        lineLearning: false,
        extendedScope: false,
      },
    },
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PERSONAL_LEARNING_REQUEST_INTAKE', 'true');
    f.environment = 'development';
    f.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'service' });
    f.membership.mockResolvedValue({ id: 'member', serviceRole: 'PARTICIPANT' });
    f.enrollment.mockResolvedValue({ id: enrollmentId, serviceProgramId: 'program' });
    f.program.mockResolvedValue({ settings });
    f.request.mockResolvedValue(null);
    f.topics.mockResolvedValue([]);
    f.transaction.mockImplementation((work: (tx: unknown) => unknown) => work({}));
    f.seat.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());
  it('requires explicit non-production enablement', () => {
    expect(personalLearningRequestEnabled()).toBe(true);
    f.environment = 'staging';
    expect(personalLearningRequestEnabled()).toBe(true);
    f.environment = 'production';
    expect(personalLearningRequestEnabled()).toBe(true);
    f.environment = 'development';
    vi.stubEnv('PERSONAL_LEARNING_REQUEST_INTAKE', 'false');
    expect(personalLearningRequestEnabled()).toBe(false);
  });
  it('scope is server-resolved and checks active enrollment/program', async () => {
    const result = await resolvePersonalLearningRequestActor('slug', enrollmentId, 'user');
    expect(result.scope).toMatchObject({
      workspaceId: 'workspace',
      groupId: 'service',
      userId: 'user',
      groupMembershipId: 'member',
    });
    expect(f.membership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user',
          serviceRole: { in: ['PARTICIPANT', 'SERVICE_OWNER'] },
          status: 'ACTIVE',
        }),
      }),
    );
    expect(f.enrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: enrollmentId, status: 'ACTIVE' }),
      }),
    );
    expect(f.seat).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: 'workspace',
        groupId: 'service',
        programEnrollmentId: enrollmentId,
        userId: 'user',
      }),
      true,
    );
    expect(f.request).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ topicId: { not: null } }) }),
    );
    expect(f.topics).not.toHaveBeenCalled();
  });
  it('selects only an active owned theme when multiTopic is enabled', async () => {
    const multiTopicSettings = {
      ...settings,
      personalLearningPilot: {
        ...settings.personalLearningPilot,
        learningFeatures: {
          ...settings.personalLearningPilot.learningFeatures,
          multiTopic: true,
        },
      },
    };
    f.program.mockResolvedValue({ settings: multiTopicSettings });
    f.topics.mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000002' }]);
    await expect(
      resolvePersonalLearningRequestActor(
        'slug',
        enrollmentId,
        'user',
        undefined,
        '00000000-0000-4000-8000-000000000002',
      ),
    ).resolves.toMatchObject({ topicId: '00000000-0000-4000-8000-000000000002' });
    expect(f.topics).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace',
          groupId: 'service',
          programEnrollmentId: enrollmentId,
          groupMembershipId: 'member',
          userId: 'user',
          status: 'ACTIVE',
        }),
        take: 4,
      }),
    );
    await expect(
      resolvePersonalLearningRequestActor(
        'slug',
        enrollmentId,
        'user',
        undefined,
        '00000000-0000-4000-8000-000000000099',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('rejects an unresolved theme when multiTopic is enabled, except on explicit selection surfaces', async () => {
    const multiTopicSettings = {
      ...settings,
      personalLearningPilot: {
        ...settings.personalLearningPilot,
        learningFeatures: {
          ...settings.personalLearningPilot.learningFeatures,
          multiTopic: true,
        },
      },
    };
    f.program.mockResolvedValue({ settings: multiTopicSettings });

    f.topics.mockResolvedValue([]);
    await expect(
      resolvePersonalLearningRequestActor('slug', enrollmentId, 'user'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const selectionActor = await resolvePersonalLearningRequestActor(
      'slug',
      enrollmentId,
      'user',
      undefined,
      undefined,
      { allowUnselectedTopic: true },
    );
    expect(selectionActor.scope.userId).toBe('user');
    expect(selectionActor).not.toHaveProperty('topicId');

    f.topics.mockResolvedValue([
      { id: '00000000-0000-4000-8000-000000000002' },
      { id: '00000000-0000-4000-8000-000000000003' },
    ]);
    await expect(
      resolvePersonalLearningRequestActor('slug', enrollmentId, 'user'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      resolvePersonalLearningRequestActor(
        'slug',
        enrollmentId,
        'user',
        undefined,
        '00000000-0000-4000-8000-000000000003',
      ),
    ).resolves.toMatchObject({ topicId: '00000000-0000-4000-8000-000000000003' });
  });
  it('non-member denied', async () => {
    f.membership.mockResolvedValue(null);
    await expect(
      resolvePersonalLearningRequestActor('slug', enrollmentId, 'other'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('production allows only a dynamic Program and rejects a disabled required feature', async () => {
    f.environment = 'production';
    f.program.mockResolvedValue({
      settings: {
        moduleKey: 'AI_TRAINING_V1',
        personalLearningPilot: {
          ...settings.personalLearningPilot,
          learningMode: 'FIXED_DEFINITIONS_V1',
        },
      },
    });
    await expect(
      resolvePersonalLearningRequestActor('slug', enrollmentId, 'user'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    f.program.mockResolvedValue({ settings });
    await expect(
      resolvePersonalLearningRequestActor('slug', enrollmentId, 'user', 'multiTopic'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(f.seat).not.toHaveBeenCalled();
  });
  it('permits a service owner only when the active dynamic seat is verified', async () => {
    f.environment = 'production';
    f.membership.mockResolvedValue({ id: 'owner-member', serviceRole: 'SERVICE_OWNER' });
    await expect(
      resolvePersonalLearningRequestActor('slug', enrollmentId, 'owner'),
    ).resolves.toMatchObject({
      scope: { groupMembershipId: 'owner-member', userId: 'owner' },
    });
    expect(f.seat).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'owner' }),
      true,
    );
  });
});
