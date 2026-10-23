import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const f = vi.hoisted(() => ({
  membership: vi.fn(),
  enrollment: vi.fn(),
  program: vi.fn(),
  consent: vi.fn(),
  evidenceProvider: vi.fn(),
}));

vi.mock('@bunshin/database', () => ({
  prisma: {
    groupMembership: { findFirst: f.membership },
    programEnrollment: { findFirst: f.enrollment },
    serviceProgram: { findFirst: f.program },
  },
  trainingEnrollmentPeriodWhere: () => ({}),
}));
vi.mock('../src/services/ai-training-consent', () => ({
  requireAiTrainingUsageConsent: f.consent,
}));
vi.mock('../src/providers/openai-learning-evidence-review', () => ({
  generateLearningEvidenceReview: f.evidenceProvider,
  learningEvidenceReviewBody: vi.fn(),
  LEARNING_EVIDENCE_REVIEW_PROMPT_VERSION: 'evidence-v1',
}));

import { executePersonalLearningEvidenceReview } from '../src/jobs/personal-learning-evidence-review';

describe('invalid offer policy worker boundaries', () => {
  const enrollmentId = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    f.membership.mockResolvedValue({ id: 'membership', serviceRole: 'PARTICIPANT' });
    f.enrollment.mockResolvedValue({ id: enrollmentId, serviceProgramId: 'program' });
    f.program.mockResolvedValue({
      settings: {
        moduleKey: 'AI_TRAINING_V1',
        learningOfferPolicy: 'UNKNOWN_POLICY',
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

  it('ends evidence review as unavailable before consent or its AI Provider', async () => {
    await expect(
      executePersonalLearningEvidenceReview({
        workspaceId: 'workspace',
        groupId: 'group',
        enrollmentId,
        answerId: 'answer',
        actorUserId: 'user',
        jobId: 'job',
        attemptCount: 1,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'practice evaluator unavailable' });
    expect(f.consent).not.toHaveBeenCalled();
    expect(f.evidenceProvider).not.toHaveBeenCalled();
  });
});
