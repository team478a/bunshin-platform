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
}));
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
    fake.membership.mockResolvedValue({ id: 'membership' });
  });
  afterEach(() => {
    vi.useRealTimers();
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
          serviceRole: 'PARTICIPANT',
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
    fake.evaluate.mockImplementation(async () => {
      vi.setSystemTime(later);
      return { provider: 'mock', model: 'mock', promptVersion: 'mock', evaluation: {} };
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
