import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  membership: vi.fn(),
  enrollment: vi.fn(),
  program: vi.fn(),
  answer: vi.fn(),
  assignment: vi.fn(),
  lock: vi.fn(),
  save: vi.fn(),
  jobs: vi.fn(),
  runtime: vi.fn(),
  evaluate: vi.fn(),
  usage: vi.fn(),
  pilotPrepare: vi.fn(),
  learnerRole: vi.fn(),
  environment: 'development',
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: fake.environment }) }));
vi.mock('@bunshin/database', () => {
  const tx = {
    groupMembership: { findFirst: fake.membership },
    programEnrollment: { findFirst: fake.enrollment },
    serviceProgram: { findFirst: fake.program },
    trainingMissionAnswer: { findFirst: fake.answer, updateMany: fake.save },
    programMissionAssignment: { findFirst: fake.assignment },
    job: { count: fake.jobs },
  };
  return {
    prisma: { ...tx, $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) },
    lockTrainingEnrollmentData: fake.lock,
    requireTrainingLearnerRole: fake.learnerRole,
    trainingEnrollmentPeriodWhere: (now: Date) => ({
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    }),
  };
});
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: fake.runtime,
}));
vi.mock('../src/observability/ai-usage', () => ({ recordAiUsageSafely: fake.usage }));
vi.mock('../src/observability/personal-learning-ai-call', () => ({
  preparePersonalLearningAiCall: fake.pilotPrepare,
}));
vi.mock('../src/organization-ai-generation-quota', () => ({
  withOrganizationAiGenerationQuota: ({ generate }: { generate: () => unknown }) => generate(),
}));
vi.mock('../src/providers/openai-training-answer-evaluator', () => ({
  TRAINING_EVALUATION_PROMPT_VERSION: 'test',
  OpenAiTrainingAnswerEvaluator: class {
    evaluate = fake.evaluate;
  },
}));
import { createTrainingAnswerEvaluationJobHandler } from '../src/jobs/training-answer-evaluation-job-handler';
import { enqueueAiTrainingEvaluation } from '../src/services/ai-training-evaluation-queue';

const now = new Date('2026-09-29T01:00:00Z');
const scope = {
  workspaceId: 'workspace',
  groupId: 'group',
  actorUserId: 'user',
  enrollmentId: 'enrollment',
  answerId: 'answer',
  correlationId: 'correlation',
};
const input = { ...scope, jobId: 'job', attemptCount: 1 };
describe('training evaluation period boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    fake.environment = 'development';
    fake.membership.mockResolvedValue({ id: 'membership' });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  it('rejects reserved Pilot queue and worker in production before any provider call', async () => {
    fake.environment = 'production';
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'true');
    fake.enrollment.mockResolvedValue({ id: scope.enrollmentId, serviceProgramId: 'program' });
    fake.program.mockResolvedValue({ id: 'program', settings: { personalLearningPilot: null } });
    await expect(enqueueAiTrainingEvaluation(scope)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(createTrainingAnswerEvaluationJobHandler().execute(input)).rejects.toThrow();
    expect(fake.runtime).not.toHaveBeenCalled();
    expect(fake.evaluate).not.toHaveBeenCalled();
    expect(fake.answer).not.toHaveBeenCalled();
  });
  it('rechecks Pilot settings immediately before a provider attempt', async () => {
    const enrollmentId = '00000000-0000-4000-8000-000000000003';
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'true');
    fake.enrollment.mockResolvedValue({ id: enrollmentId, serviceProgramId: 'program' });
    const settings = {
      moduleKey: 'AI_TRAINING_V1',
      personalLearningPilot: { enabled: true, enrollmentIds: [enrollmentId] },
      trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
    };
    fake.program.mockResolvedValueOnce({ id: 'program', settings }).mockResolvedValue({
      settings: {
        ...settings,
        personalLearningPilot: { ...settings.personalLearningPilot, enabled: false },
      },
    });
    fake.answer.mockResolvedValue({
      id: 'answer',
      missionAssignmentId: 'assignment',
      evaluationStatus: 'PENDING',
    });
    fake.assignment.mockResolvedValue({
      missionDefinitionKey: 'PROMPT_BASIC',
      displaySnapshot: {},
    });
    fake.runtime.mockResolvedValue({ model: 'synthetic', apiKey: 'synthetic-test-only' });
    await expect(
      createTrainingAnswerEvaluationJobHandler().execute({ ...input, enrollmentId }),
    ).rejects.toThrow();
    expect(fake.evaluate).not.toHaveBeenCalled();
    expect(fake.save).not.toHaveBeenCalled();
  });
  it('refuses queue/retry after lock before reading private answers or resetting failures', async () => {
    fake.enrollment.mockResolvedValue(null);
    await expect(
      enqueueAiTrainingEvaluation({ ...scope, resetFailed: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fake.enrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace',
          groupId: 'group',
          id: 'enrollment',
          status: 'ACTIVE',
          AND: [{ startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
          groupMembershipId: 'membership',
        }),
      }),
    );
    expect(fake.lock.mock.invocationCallOrder[0]).toBeLessThan(
      fake.enrollment.mock.invocationCallOrder[0]!,
    );
    expect(fake.answer).not.toHaveBeenCalled();
    expect(fake.save).not.toHaveBeenCalled();
    expect(fake.jobs).not.toHaveBeenCalled();
  });
  it('validates participant ownership and the training module before queue registration', async () => {
    fake.enrollment.mockResolvedValue({ id: 'enrollment', serviceProgramId: 'program' });
    fake.program.mockResolvedValue(null);
    await expect(enqueueAiTrainingEvaluation(scope)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fake.membership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user',
          status: 'ACTIVE',
          serviceRole: { in: ['PARTICIPANT', 'SERVICE_OWNER'] },
        }),
      }),
    );
    expect(fake.program).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace',
          groupId: 'group',
          id: 'program',
          status: 'ACTIVE',
          settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
        }),
      }),
    );
    expect(fake.answer).not.toHaveBeenCalled();
    expect(fake.jobs).not.toHaveBeenCalled();
  });
  it('does not resolve provider credentials or call an evaluator outside the period', async () => {
    fake.enrollment.mockResolvedValue(null);
    await expect(createTrainingAnswerEvaluationJobHandler().execute(input)).rejects.toMatchObject({
      retryable: false,
    });
    expect(fake.enrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [{ startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        }),
      }),
    );
    expect(fake.answer).not.toHaveBeenCalled();
    expect(fake.runtime).not.toHaveBeenCalled();
    expect(fake.evaluate).not.toHaveBeenCalled();
  });
  it('rejects an owner without an INTERNAL seat before queueing or resolving provider credentials', async () => {
    fake.membership.mockResolvedValue({ id: 'membership', serviceRole: 'SERVICE_OWNER' });
    fake.enrollment.mockResolvedValue({ id: 'enrollment', serviceProgramId: 'program' });
    fake.learnerRole.mockRejectedValue(new Error('internal seat required'));
    await expect(enqueueAiTrainingEvaluation(scope)).rejects.toThrow('internal seat required');
    await expect(createTrainingAnswerEvaluationJobHandler().execute(input)).rejects.toThrow(
      'internal seat required',
    );
    expect(fake.jobs).not.toHaveBeenCalled();
    expect(fake.runtime).not.toHaveBeenCalled();
    expect(fake.evaluate).not.toHaveBeenCalled();
  });
  it('rechecks immediately before a provider attempt and does not log a provider failure for a period rejection', async () => {
    fake.enrollment
      .mockResolvedValueOnce({ id: 'enrollment', serviceProgramId: 'program' })
      .mockResolvedValueOnce(null);
    fake.program.mockResolvedValue({ id: 'program' });
    fake.answer.mockResolvedValue({
      id: 'answer',
      missionAssignmentId: 'assignment',
      answer: 'private answer',
      evaluationStatus: 'PENDING',
    });
    fake.assignment.mockResolvedValue({ missionDefinitionKey: 'AI_BASIC', displaySnapshot: {} });
    fake.runtime.mockResolvedValue({ apiKey: 'test-only', model: 'mock' });
    await expect(createTrainingAnswerEvaluationJobHandler().execute(input)).rejects.toMatchObject({
      retryable: false,
    });
    expect(fake.evaluate).not.toHaveBeenCalled();
    expect(fake.usage).not.toHaveBeenCalled();
    expect(fake.save).not.toHaveBeenCalled();
  });
  it('rejects a late evaluation after the lock without saving scores or progress', async () => {
    fake.enrollment
      .mockResolvedValueOnce({ id: 'enrollment', serviceProgramId: 'program' })
      .mockResolvedValueOnce({ id: 'enrollment' })
      .mockResolvedValueOnce(null);
    fake.program.mockResolvedValue({ id: 'program' });
    fake.answer.mockResolvedValue({
      id: 'answer',
      missionAssignmentId: 'assignment',
      answer: 'private answer',
      evaluationStatus: 'PENDING',
    });
    fake.assignment.mockResolvedValue({ missionDefinitionKey: 'AI_BASIC', displaySnapshot: {} });
    fake.runtime.mockResolvedValue({ apiKey: 'test-only', model: 'mock' });
    const later = new Date(now.getTime() + 60000);
    fake.evaluate.mockImplementation(() => {
      vi.setSystemTime(later);
      return Promise.resolve({
        provider: 'mock',
        model: 'mock',
        promptVersion: 'mock',
        evaluation: {},
      });
    });
    await expect(createTrainingAnswerEvaluationJobHandler().execute(input)).rejects.toMatchObject({
      retryable: false,
    });
    expect(fake.enrollment).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [{ startsAt: { lte: later }, OR: [{ endsAt: null }, { endsAt: { gt: later } }] }],
        }),
      }),
    );
    expect(fake.lock.mock.invocationCallOrder[0]).toBeLessThan(
      fake.enrollment.mock.invocationCallOrder[2]!,
    );
    expect(fake.save).not.toHaveBeenCalled();
    expect(fake.usage).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCESS' }));
  });
});
