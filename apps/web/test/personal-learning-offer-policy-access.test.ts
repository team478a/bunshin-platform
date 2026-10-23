import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const f = vi.hoisted(() => ({
  service: vi.fn(),
  membership: vi.fn(),
  enrollment: vi.fn(),
  program: vi.fn(),
  consent: vi.fn(),
  seat: vi.fn(),
}));

vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_ENV: 'production' }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: f.service }));
vi.mock('../src/services/ai-training-consent', () => ({
  requireAiTrainingUsageConsent: f.consent,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    groupMembership: { findFirst: f.membership },
    programEnrollment: { findFirst: f.enrollment },
    serviceProgram: { findFirst: f.program },
  },
  requirePersonalLearningPilotSeat: f.seat,
}));

import { resolvePersonalLearningRequestActor } from '../src/services/personal-learning-request-access';

describe('personal learning offer policy access boundary', () => {
  const enrollmentId = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PERSONAL_LEARNING_REQUEST_INTAKE', 'true');
    f.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'service' });
    f.membership.mockResolvedValue({ id: 'membership', serviceRole: 'PARTICIPANT' });
    f.enrollment.mockResolvedValue({ id: enrollmentId, serviceProgramId: 'program' });
    f.program.mockResolvedValue({
      settings: {
        moduleKey: 'AI_TRAINING_V1',
        learningOfferPolicy: 'UNKNOWN_POLICY',
        trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
        personalLearningPilot: {
          enabled: true,
          enrollmentIds: [enrollmentId],
          learningMode: 'DYNAMIC_V1',
          learningFeatures: {
            conversation: true,
            multiTopic: false,
            lineLearning: true,
            extendedScope: false,
          },
        },
      },
    });
  });

  it('rejects an invalid server-side policy before consent or any learner AI route', async () => {
    await expect(
      resolvePersonalLearningRequestActor('service', enrollmentId, 'user'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'learning request unavailable' });
    expect(f.seat).not.toHaveBeenCalled();
    expect(f.consent).not.toHaveBeenCalled();
  });
});
