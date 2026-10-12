import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import type * as ApplicationModule from '@bunshin/application';
const f = vi.hoisted(() => ({
  prepare: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  execute: vi.fn(),
  runtime: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  pricing: vi.fn(),
  admission: vi.fn(),
  body: vi.fn(),
  generate: vi.fn(),
}));
vi.mock('@bunshin/database', () => ({
  prisma: { personalLearningCallAdmission: { findUnique: f.admission } },
  PrismaPracticeSupportRepository: class {
    prepareSupport = f.prepare;
    completeSupport = f.complete;
    failSupport = f.fail;
  },
  PrismaPersonalLearningTextOperationRepository: class {},
}));
vi.mock('@bunshin/application', async (importOriginal) => {
  const real = await importOriginal<typeof ApplicationModule>();
  return { ...real, executePersonalLearningTextOperation: f.execute };
});
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: f.runtime,
  reserveOpenAiRuntimeConfiguration: f.reserve,
  settleProviderRuntimeAdmission: f.settle,
}));
vi.mock('../src/observability/personal-learning-ai-call', () => ({
  personalLearningPricingRegistry: f.pricing,
}));
vi.mock('../src/providers/openai-learning-support', () => ({
  learningSupportBody: f.body,
  generateLearningSupport: f.generate,
  LEARNING_SUPPORT_PROMPT_VERSION: 'support-v1',
}));
import { requestPracticeSupport } from '../src/services/personal-learning-practice-support';
const id = '11111111-1111-4111-8111-111111111111';
const command = {
  actor: {
    actorUserId: id,
    scope: {
      workspaceId: id,
      groupId: id,
      programEnrollmentId: id,
      groupMembershipId: id,
      userId: id,
    },
  },
  assignmentId: id,
  operationId: id,
  expectedNoteRevision: 0,
  expectedSupportRevision: 0,
  reason: 'UNKNOWN' as const,
  text: 'ここで止まった',
};
const advice = {
  cause: 'UNKNOWN',
  explanation: '確認します',
  nextAction: '',
  question: 'どこまで進めましたか',
};
const practice = {
  candidate: { requestId: id, requestRevision: 2 },
  support: { revision: 1, history: [] },
};
const request = { id, revision: 1, noteRevision: 0, status: 'PENDING' };
describe('practice support orchestration', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      'PERSONAL_LEARNING_LESSON_ADMISSION',
      JSON.stringify({
        workspaceId: id,
        groupId: id,
        serviceProgramId: id,
        model: 'synthetic',
        dailyAttemptLimit: 3,
        maxConcurrent: 1,
        maxRequestBytes: 1000,
        maxOutputTokens: 100,
        dailyCostLimitUsdMicros: 10000,
      }),
    );
    f.prepare.mockResolvedValue({ practice, request, created: true });
    f.complete.mockResolvedValue(practice);
    f.fail.mockResolvedValue(undefined);
    f.runtime.mockResolvedValue({ model: 'synthetic' });
    f.reserve.mockResolvedValue({
      model: 'synthetic',
      apiKey: 'synthetic',
      admission: { id: 'global' },
    });
    f.pricing.mockReturnValue([
      {
        provider: 'openai',
        model: 'synthetic',
        effectiveFrom: '2026-01-01T00:00:00Z',
        inputPriceMicrosPerMillion: 2000000,
        outputPriceMicrosPerMillion: 8000000,
        cachedInputPriceMicrosPerMillion: 200000,
        currency: 'USD',
        pricingVersion: 'synthetic-v1',
      },
    ]);
    f.admission.mockResolvedValue({ reservedCostUsdMicros: 2800n, settledAt: new Date() });
    f.body.mockReturnValue('synthetic-body');
    f.generate.mockResolvedValue({ value: advice });
    f.execute.mockImplementation(
      async (
        _repo: unknown,
        _op: unknown,
        call: (permit: { id: string; operationHash: string }) => Promise<{ value: unknown }>,
      ) => (await call({ id, operationHash: 'a'.repeat(64) })).value,
    );
    f.settle.mockResolvedValue(undefined);
  });
  it('reserves twice at existing program/provider boundaries then applies with the immutable context', async () => {
    expect(await requestPracticeSupport(command)).toEqual(practice);
    expect(f.execute.mock.calls[0]?.[1]).toMatchObject({
      requestId: id,
      expectedRequestRevision: 2,
      operationKind: 'PRACTICE_SUPPORT',
      practice: { assignmentId: id, noteRevision: 0, supportRevision: 1, supportRequestId: id },
    });
    expect(f.reserve).toHaveBeenCalledWith(
      `personal-learning-operation:${'a'.repeat(64)}`,
      undefined,
      'LEARNING_SUPPORT',
      2800,
      1,
    );
    expect(f.complete).toHaveBeenCalledWith(
      expect.objectContaining({ command, advice, requestId: id, promptVersion: 'support-v1' }),
    );
    expect(f.settle).toHaveBeenCalledOnce();
    expect(f.fail).not.toHaveBeenCalled();
  });
  it('returns a stored READY response without new runtime, call or cost', async () => {
    f.prepare.mockResolvedValue({
      practice,
      request: { ...request, status: 'READY' },
      created: false,
    });
    expect(await requestPracticeSupport(command)).toEqual(practice);
    expect(f.runtime).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.complete).not.toHaveBeenCalled();
  });
  it.each(['PENDING', 'FAILED', 'STALE'])(
    'same operation in %s never reruns AI',
    async (status) => {
      f.prepare.mockResolvedValue({ practice, request: { ...request, status }, created: false });
      await expect(requestPracticeSupport(command)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  it('does not send when prices are missing and keeps a durable failure', async () => {
    f.pricing.mockReturnValue([]);
    await expect(requestPracticeSupport(command)).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
    });
    expect(f.fail).toHaveBeenCalledWith({ command, requestId: id });
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('does not apply an AI failure or settle an uncertain permit', async () => {
    f.generate.mockRejectedValue(new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'private'));
    f.admission.mockResolvedValue({ reservedCostUsdMicros: 2800n, settledAt: null });
    await expect(requestPracticeSupport(command)).rejects.toThrow();
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.fail).toHaveBeenCalledOnce();
    expect(f.settle).not.toHaveBeenCalled();
  });
  it('a failed durable apply still records failure but closes only a known settled provider reservation', async () => {
    f.complete.mockRejectedValue(new ApplicationError('CONFLICT', 'changed'));
    await expect(requestPracticeSupport(command)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.fail).toHaveBeenCalledOnce();
    expect(f.settle).toHaveBeenCalledOnce();
  });
});
