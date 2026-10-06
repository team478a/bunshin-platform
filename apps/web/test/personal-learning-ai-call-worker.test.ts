import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const fake = vi.hoisted(() => {
  const state: {
    measurement: Record<string, unknown>;
    options: Record<string, unknown>;
    error: Error | null;
  } = { measurement: {}, options: {}, error: null };
  return {
    membership: vi.fn(),
    enrollment: vi.fn(),
    program: vi.fn(),
    answer: vi.fn(),
    assignment: vi.fn(),
    save: vi.fn(),
    usage: vi.fn(),
    prepare: vi.fn(),
    record: vi.fn(),
    evaluate: vi.fn(),
    authorize: vi.fn(),
    ...state,
  };
});
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: 'staging' }) }));
vi.mock('@bunshin/database', () => {
  const tx = {
    groupMembership: { findFirst: fake.membership },
    programEnrollment: { findFirst: fake.enrollment },
    serviceProgram: { findFirst: fake.program },
    trainingMissionAnswer: { findFirst: fake.answer, updateMany: fake.save },
    programMissionAssignment: { findFirst: fake.assignment },
  };
  return {
    prisma: { ...tx, $transaction: (fn: (tx: unknown) => unknown) => fn(tx) },
    lockTrainingEnrollmentData: vi.fn(),
    trainingEnrollmentPeriodWhere: () => ({}),
    PrismaPersonalLearningAssessmentGate: class {
      authorizeAssessment = fake.authorize;
    },
  };
});
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: () =>
    Promise.resolve({
      apiKey: 'synthetic-key',
      model: 'unchanged-model',
      requestCostUsdMicros: 999,
    }),
}));
vi.mock('../src/observability/ai-usage', () => ({ recordAiUsageSafely: fake.usage }));
vi.mock('../src/observability/personal-learning-ai-call', () => ({
  preparePersonalLearningAiCall: fake.prepare,
}));
vi.mock('../src/organization-ai-generation-quota', () => ({
  withOrganizationAiGenerationQuota: ({ generate }: { generate: () => unknown }) => generate(),
}));
vi.mock('../src/providers/openai-training-answer-evaluator', () => ({
  TRAINING_EVALUATION_PROMPT_VERSION: 'unchanged-prompt',
  OpenAiTrainingAnswerEvaluator: class {
    constructor(options: Record<string, unknown>) {
      fake.options = options;
    }
    evaluate(input: unknown) {
      (fake.options['onRequestStarted'] as (() => void) | undefined)?.();
      fake.evaluate(input);
      (fake.options['observe'] as ((v: unknown) => void) | undefined)?.(fake.measurement);
      if (fake.error) return Promise.reject(fake.error);
      return Promise.resolve({
        evaluation: {},
        provider: 'openai',
        model: 'response-model',
        promptVersion: 'unchanged-prompt',
        inputTokens: 100,
        outputTokens: 20,
        latencyMs: 10,
        estimatedCostUsdMicros: 999,
      });
    }
  },
}));
import { createTrainingAnswerEvaluationJobHandler } from '../src/jobs/training-answer-evaluation-job-handler';
const enrollmentId = '00000000-0000-4000-8000-000000000003';
const input = {
  workspaceId: 'workspace',
  groupId: 'group',
  actorUserId: 'user',
  enrollmentId,
  answerId: 'answer',
  jobId: 'job',
  attemptCount: 1,
};
const settings = {
  moduleKey: 'AI_TRAINING_V1',
  personalLearningPilot: { enabled: true, enrollmentIds: [enrollmentId] },
  trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
};
describe('Pilot Assessment AI call wiring', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'true');
    fake.error = null;
    fake.authorize.mockResolvedValue(undefined);
    fake.membership.mockResolvedValue({ id: 'membership' });
    fake.enrollment.mockResolvedValue({ id: enrollmentId, serviceProgramId: 'program' });
    fake.program.mockResolvedValue({ id: 'program', settings });
    fake.answer.mockResolvedValue({
      id: 'answer',
      missionAssignmentId: 'assignment',
      evaluationStatus: 'PENDING',
      answer: 'private answer',
    });
    fake.assignment.mockResolvedValue({
      missionDefinitionKey: 'PROMPT_BASIC',
      displaySnapshot: {},
    });
    fake.save.mockResolvedValue({ count: 0 });
    fake.measurement = {
      provider: 'openai',
      model: 'response-model',
      inputTokens: 100,
      outputTokens: 20,
      cachedInputTokens: 0,
      latencyMs: 10,
      success: true,
      errorCategory: null,
      validationResult: 'PASSED',
      fallbackUsed: false,
      occurredAt: '2026-10-06T00:00:00Z',
    };
    fake.prepare.mockResolvedValue({
      record: fake.record,
      cost: () => ({ totalCostUsdMicros: 120, pricing: { pricingVersion: 'synthetic-price-v1' } }),
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('wires only Pilot calls, uses response usage price and links the same attempt key', async () => {
    await createTrainingAnswerEvaluationJobHandler().execute(input);
    expect(fake.options['model']).toBe('unchanged-model');
    expect(fake.usage).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedCostUsdMicros: 120,
        pricingVersion: 'synthetic-price-v1',
        idempotencyKey: 'training-evaluation:answer:job:attempt:1',
      }),
    );
    expect(fake.record).toHaveBeenCalledWith(
      'training-evaluation:answer:job:attempt:1',
      fake.measurement,
    );
    expect(fake.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user',
        scope: expect.objectContaining({ programEnrollmentId: enrollmentId, userId: 'user' }),
      }),
      'assignment',
      'answer',
    );
  });
  it('failed validation still records consumed usage once and keeps existing retry policy', async () => {
    fake.measurement = {
      ...fake.measurement,
      success: false,
      errorCategory: 'VALIDATION_FAILURE',
      validationResult: 'FAILED',
    };
    fake.error = new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'synthetic private error');
    await expect(createTrainingAnswerEvaluationJobHandler().execute(input)).rejects.toMatchObject({
      retryable: true,
    });
    expect(fake.record).toHaveBeenCalledOnce();
    expect(fake.evaluate).toHaveBeenCalledOnce();
    expect(fake.usage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        inputTokens: 100,
        outputTokens: 20,
        estimatedCostUsdMicros: 120,
      }),
    );
  });
  it('legacy V1 retains its Provider/result cost without P1-G observation', async () => {
    fake.program.mockResolvedValue({ id: 'program', settings: { moduleKey: 'AI_TRAINING_V1' } });
    await createTrainingAnswerEvaluationJobHandler().execute(input);
    expect(fake.prepare).not.toHaveBeenCalled();
    expect(fake.options['observe']).toBeUndefined();
    expect(fake.usage).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedCostUsdMicros: 999,
        pricingVersion: 'admin-request-cost-v1',
      }),
    );
  });
  it('Pilot context mismatch stops before Provider and does not invent a call', async () => {
    fake.prepare.mockRejectedValue(new ApplicationError('NOT_FOUND', 'scope mismatch'));
    await expect(createTrainingAnswerEvaluationJobHandler().execute(input)).rejects.toThrow();
    expect(fake.evaluate).not.toHaveBeenCalled();
    expect(fake.record).not.toHaveBeenCalled();
    expect(fake.usage).not.toHaveBeenCalled();
  });
  it.each(['Goal cancelled', 'Plan revised', 'Definition withdrawn', 'actor revoked'])(
    'fresh authorization rejects %s before any external call',
    async () => {
      fake.authorize.mockRejectedValue(new ApplicationError('NOT_FOUND', 'unavailable'));
      await expect(createTrainingAnswerEvaluationJobHandler().execute(input)).rejects.toMatchObject(
        { retryable: false },
      );
      expect(fake.evaluate).not.toHaveBeenCalled();
      expect(fake.record).not.toHaveBeenCalled();
    },
  );
  it('marker removed during quota wait cannot fall back to legacy', async () => {
    fake.program
      .mockResolvedValueOnce({ id: 'program', settings })
      .mockResolvedValue({ settings: { moduleKey: 'AI_TRAINING_V1' } });
    await expect(createTrainingAnswerEvaluationJobHandler().execute(input)).rejects.toMatchObject({
      retryable: false,
    });
    expect(fake.evaluate).not.toHaveBeenCalled();
  });
  it('a persisted Plan assignment with a missing marker is not legacy V1', async () => {
    fake.program.mockResolvedValue({ id: 'program', settings: { moduleKey: 'AI_TRAINING_V1' } });
    fake.assignment.mockResolvedValue({
      missionDefinitionKey: 'PROMPT_BASIC',
      displaySnapshot: {},
      targetResourceType: 'PERSONAL_LEARNING_PLAN',
    });
    await expect(createTrainingAnswerEvaluationJobHandler().execute(input)).rejects.toMatchObject({
      retryable: false,
    });
    expect(fake.evaluate).not.toHaveBeenCalled();
    expect(fake.prepare).not.toHaveBeenCalled();
  });
});
