import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const f = vi.hoisted(() => ({
  request: vi.fn(),
  prior: vi.fn(),
  save: vi.fn(),
  admit: vi.fn(),
  record: vi.fn(),
  cost: vi.fn(),
  resolve: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  generate: vi.fn(),
  prices: vi.fn(),
  extendedScope: vi.fn(),
  persona: vi.fn(),
}));
vi.mock('@bunshin/database', () => ({
  prisma: { personalLearningCallAdmission: { findUnique: f.cost } },
  PrismaLearningCandidateRepository: class {
    readCandidate = f.prior;
    save = f.save;
  },
  PrismaPersonalLearningRequestRepository: class {
    readRequest = f.request;
  },
  PrismaPersonalLearningPersonaRepository: class {
    listForAi = f.persona;
  },
  PrismaPersonalLearningTextOperationRepository: class {
    admit = f.admit;
    record = f.record;
  },
}));
vi.mock('../src/ai/learning-provider-runtime', () => ({
  resolveLearningProviderRuntimeConfiguration: f.resolve,
  reserveLearningProviderRuntimeConfiguration: f.reserve,
}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  settleProviderRuntimeAdmission: f.settle,
}));
vi.mock('../src/observability/personal-learning-ai-call', () => ({
  personalLearningPricingRegistry: f.prices,
}));
vi.mock('../src/providers/openai-learning-lesson', async () => {
  const actual = await vi.importActual<object>('../src/providers/openai-learning-lesson');
  return { ...actual, generateLearningLesson: f.generate };
});
vi.mock('../src/services/personal-learning-extended-scope', () => ({
  resolvePersonalLearningExtendedScope: f.extendedScope,
}));
import { prepareLearningLesson } from '../src/services/personal-learning-lesson-candidate';
const id = '11111111-1111-4111-8111-111111111111';
const actor = {
  actorUserId: id,
  scope: {
    workspaceId: id,
    groupId: id,
    programEnrollmentId: id,
    groupMembershipId: id,
    userId: id,
  },
};
const model = 'gpt-5.2-2025-12-11';
const proposal = {
  status: 'READY',
  reason: '本人による実践',
  questions: [],
  outcome: '見出しを直す',
  explanation: 'AIへ希望を伝える',
  example: 'お店を紹介する',
  practice: ['本人が直す'],
  evidence: ['見出し'],
  criteria: ['希望に合う'],
};
describe('lesson generation composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      'PERSONAL_LEARNING_LESSON_ADMISSION',
      JSON.stringify({
        workspaceId: id,
        groupId: id,
        serviceProgramId: id,
        dailyAttemptLimit: 5,
        maxConcurrent: 1,
        model,
        maxRequestBytes: 16000,
        maxOutputTokens: 2000,
        dailyCostLimitUsdMicros: 100000,
      }),
    );
    f.request.mockResolvedValue({
      id,
      revision: 1,
      originalText: 'AIでホームページを作りたい',
      deviceType: 'PC',
      toolDescription: 'AIチャット',
      experienceDescription: null,
      currentPosition: null,
      createdAt: '2026-10-13T00:00:00Z',
    });
    f.prior.mockResolvedValue(null);
    f.persona.mockResolvedValue([]);
    f.extendedScope.mockResolvedValue(false);
    f.resolve.mockResolvedValue({
      provider: 'openai',
      model,
      modelCapabilities: ['STRUCTURED_OUTPUT', 'IMAGE_INPUT'],
      apiKey: 'synthetic',
      requestCostUsdMicros: 250,
      source: 'ADMIN_CONFIGURATION',
      admission: null,
    });
    f.reserve.mockResolvedValue({
      provider: 'openai',
      model,
      modelCapabilities: ['STRUCTURED_OUTPUT', 'IMAGE_INPUT'],
      apiKey: 'synthetic',
      requestCostUsdMicros: 250,
      source: 'ADMIN_CONFIGURATION',
      admission: { id: 'synthetic' },
    });
    f.admit.mockResolvedValue({
      id,
      operationHash: 'a'.repeat(64),
      maxRequestBytes: 16000,
      maxOutputTokens: 2000,
    });
    f.record.mockResolvedValue(undefined);
    f.cost.mockResolvedValue({ reservedCostUsdMicros: 48000n, settledAt: new Date() });
    f.settle.mockResolvedValue(undefined);
    f.save.mockResolvedValue({ id: 'candidate' });
    f.prices.mockReturnValue([
      {
        provider: 'openai',
        model,
        effectiveFrom: '2026-01-01T00:00:00Z',
        inputPriceMicrosPerMillion: 2000000,
        outputPriceMicrosPerMillion: 8000000,
        cachedInputPriceMicrosPerMillion: 200000,
        currency: 'USD',
        pricingVersion: 'synthetic',
      },
    ]);
    f.generate.mockResolvedValue({
      value: proposal,
      measurement: {
        provider: 'openai',
        model,
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 0,
        latencyMs: 10,
        success: true,
        errorCategory: null,
        validationResult: 'PASSED',
        fallbackUsed: false,
        occurredAt: new Date().toISOString(),
      },
      requestFinished: true,
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('records durable costs and settles Provider reservation before saving the candidate', async () => {
    expect(await prepareLearningLesson(actor, id, 1, id)).toEqual({ id: 'candidate' });
    expect(f.record).toHaveBeenCalledOnce();
    expect(f.reserve).toHaveBeenCalledOnce();
    expect(f.settle).toHaveBeenCalledOnce();
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.record.mock.invocationCallOrder[0]).toBeLessThan(
      f.settle.mock.invocationCallOrder[0]!,
    );
    expect(f.settle.mock.invocationCallOrder[0]).toBeLessThan(f.save.mock.invocationCallOrder[0]!);
  });
  it('reuses a saved candidate without resolving or calling AI', async () => {
    f.prior.mockResolvedValue({ id: 'saved' });
    expect(await prepareLearningLesson(actor, id, 1, id)).toEqual({ id: 'saved' });
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.resolve).not.toHaveBeenCalled();
  });
  it('denies missing prices before program/provider reservation', async () => {
    f.prices.mockReturnValue([]);
    await expect(prepareLearningLesson(actor, id, 1, id)).rejects.toThrow();
    expect(f.admit).not.toHaveBeenCalled();
    expect(f.reserve).not.toHaveBeenCalled();
  });
  it('never saves output after cost recording fails and retains Provider reservation', async () => {
    f.record.mockRejectedValue(new Error('synthetic persistence failure'));
    f.cost.mockResolvedValue({ reservedCostUsdMicros: 48000n, settledAt: null });
    await expect(prepareLearningLesson(actor, id, 1, id)).rejects.toThrow();
    expect(f.save).not.toHaveBeenCalled();
    expect(f.settle).not.toHaveBeenCalled();
  });
});
