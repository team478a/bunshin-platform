import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import type * as ApplicationModule from '@bunshin/application';

const f = vi.hoisted(() => ({
  prepare: vi.fn(),
  read: vi.fn(),
  readWish: vi.fn(),
  candidate: vi.fn(),
  practice: vi.fn(),
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
  extendedScope: vi.fn(),
  persona: vi.fn(),
}));
vi.mock('@bunshin/database', () => ({
  prisma: { personalLearningCallAdmission: { findUnique: f.admission } },
  PrismaPersonalLearningConversationRepository: class {
    prepareTurn = f.prepare;
    readConversation = f.read;
    readPractice = f.practice;
    completeTurn = f.complete;
    failTurn = f.fail;
  },
  PrismaLearningCandidateRepository: class {
    readCandidate = f.candidate;
  },
  PrismaPersonalLearningTextOperationRepository: class {},
  PrismaPersonalLearningRequestRepository: class {
    readRequest = f.readWish;
  },
  PrismaPersonalLearningPersonaRepository: class {
    listForAi = f.persona;
  },
}));
vi.mock('@bunshin/application', async (importOriginal) => {
  const real = await importOriginal<typeof ApplicationModule>();
  return { ...real, executePersonalLearningTextOperation: f.execute };
});
vi.mock('../src/ai/learning-provider-runtime', () => ({
  resolveLearningProviderRuntimeConfiguration: f.runtime,
  reserveLearningProviderRuntimeConfiguration: f.reserve,
}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  settleProviderRuntimeAdmission: f.settle,
}));
vi.mock('../src/observability/personal-learning-ai-call', () => ({
  personalLearningPricingRegistry: f.pricing,
}));
vi.mock('../src/providers/openai-learning-conversation', () => ({
  learningConversationBody: f.body,
  generateLearningConversation: f.generate,
  learningConversationPromptVersion: (extendedScope: boolean) =>
    extendedScope ? 'conversation-v3' : 'conversation-v2',
}));
vi.mock('../src/services/personal-learning-extended-scope', () => ({
  resolvePersonalLearningExtendedScope: f.extendedScope,
  resolvePersonalLearningOfferContext: async (...args: unknown[]) => ({
    offerPolicy: 'AI_SKILL_V1',
    extendedScope: await f.extendedScope(...args),
  }),
}));

import { sendPersonalLearningConversationTurn } from '../src/services/personal-learning-conversation';

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
  requestId: id,
  requestRevision: 1,
  operationId: id,
  text: 'どこから始めればいいですか',
};
const wish = {
  id,
  revision: 1,
  createdAt: '2026-10-17T00:00:00.000Z',
  originalText: 'AIで業務を効率化したい',
  deviceType: null,
  toolDescription: null,
  experienceDescription: null,
  currentPosition: null,
};
const state = { threadId: id, requestId: id, requestRevision: 1, messages: [], sharedAt: null };
const policy = {
  workspaceId: id,
  groupId: id,
  serviceProgramId: id,
  model: 'synthetic',
  dailyAttemptLimit: 3,
  maxConcurrent: 1,
  dailyCostLimitUsdMicros: 10000,
  maxRequestBytes: 1000,
  maxOutputTokens: 100,
};

describe('personal learning conversation orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PERSONAL_LEARNING_LESSON_ADMISSION', JSON.stringify(policy));
    f.prepare.mockResolvedValue({ created: true, context: [], request: { id, status: 'PENDING' } });
    f.read.mockResolvedValue(state);
    f.readWish.mockResolvedValue(wish);
    f.persona.mockResolvedValue([]);
    f.candidate.mockResolvedValue(null);
    f.extendedScope.mockResolvedValue(false);
    f.practice.mockResolvedValue({ allowed: true, current: null });
    f.complete.mockResolvedValue(state);
    f.fail.mockResolvedValue(undefined);
    f.runtime.mockResolvedValue({
      provider: 'openai',
      model: 'synthetic',
      modelCapabilities: ['STRUCTURED_OUTPUT', 'IMAGE_INPUT'],
      apiKey: 'test',
      requestCostUsdMicros: 250,
      source: 'ADMIN_CONFIGURATION',
      admission: null,
    });
    f.reserve.mockResolvedValue({
      provider: 'openai',
      model: 'synthetic',
      modelCapabilities: ['STRUCTURED_OUTPUT', 'IMAGE_INPUT'],
      apiKey: 'test',
      requestCostUsdMicros: 250,
      source: 'ADMIN_CONFIGURATION',
      admission: { id: 'global' },
    });
    f.pricing.mockReturnValue([
      {
        provider: 'openai',
        model: 'synthetic',
        effectiveFrom: '2026-01-01T00:00:00Z',
        inputPriceMicrosPerMillion: 1000000,
        outputPriceMicrosPerMillion: 1000000,
        cachedInputPriceMicrosPerMillion: 100000,
        currency: 'USD',
        pricingVersion: 'test-v1',
      },
    ]);
    f.admission.mockResolvedValue({ reservedCostUsdMicros: 100n, settledAt: new Date() });
    f.body.mockReturnValue('bounded-body');
    f.generate.mockResolvedValue({
      value: {
        status: 'NEEDS_CONTEXT',
        message: 'どの画面を見ていますか？',
        regeneratedProposal: null,
        environmentCapture: null,
      },
      measurement: {
        provider: 'openai',
        model: 'synthetic',
        inputTokens: 1,
        outputTokens: 1,
        cachedInputTokens: 0,
        latencyMs: 1,
        success: true,
        errorCategory: null,
        validationResult: 'VALID',
        fallbackUsed: false,
        occurredAt: '2026-10-17T00:00:00.000Z',
      },
      requestFinished: true,
    });
    f.execute.mockImplementation(
      async (
        _repo: unknown,
        _operation: unknown,
        call: (permit: { id: string; operationHash: string }) => Promise<{ value: unknown }>,
      ) => (await call({ id, operationHash: 'a'.repeat(64) })).value,
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns an idempotent prior turn without a new AI call or reservation', async () => {
    f.prepare.mockResolvedValue({ created: false });
    expect(await sendPersonalLearningConversationTurn(command)).toEqual({
      conversation: state,
      candidate: null,
    });
    expect(f.runtime).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });

  it('reserves through the existing program admission before calling AI and preserves the wish', async () => {
    await sendPersonalLearningConversationTurn(command);
    expect(f.execute.mock.calls[0]?.[1]).toMatchObject({
      requestId: id,
      expectedRequestRevision: 1,
      operationId: id,
      operationKind: 'CONVERSATION_TURN',
      policy,
    });
    expect(f.body).toHaveBeenCalledWith(
      expect.objectContaining({
        request: wish,
        currentMessage: command.text,
        history: [],
        candidate: null,
        practice: null,
      }),
    );
    expect(f.reserve).toHaveBeenCalledWith(
      `personal-learning-operation:${'a'.repeat(64)}`,
      'openai',
      'LEARNING_CONVERSATION',
      100,
      1,
    );
    expect(f.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        command,
        response: 'どの画面を見ていますか？',
        promptVersion: 'conversation-v2',
      }),
    );
    expect(f.settle).toHaveBeenCalledOnce();
  });

  it('regenerates a NEEDS_CONTEXT candidate using the same chat turn and keeps the original wish', async () => {
    const currentCandidate = {
      id: 'candidate-old',
      requestId: id,
      requestRevision: 1,
      originalText: wish.originalText,
      policyVersion: 'LEARNER_PRACTICE_TOOL_INDEPENDENT_V1',
      materialVersion: 1,
      promptVersion: 'lesson-v1',
      usageKey: `personal-learning-operation:${'b'.repeat(64)}`,
      createdAt: '2026-10-17T00:00:00.000Z',
      confirmedAt: null,
      proposal: {
        status: 'NEEDS_CONTEXT',
        reason: '端末の確認が必要',
        questions: ['どの端末を使いますか？'],
        outcome: '',
        explanation: '',
        example: '',
        practice: [],
        evidence: [],
        criteria: [],
      },
    };
    f.candidate.mockResolvedValueOnce(currentCandidate).mockResolvedValueOnce({
      ...currentCandidate,
      id: 'candidate-new',
    });
    f.generate.mockResolvedValueOnce({
      value: {
        status: 'ANSWER',
        message: '回答を反映して教材候補を更新しました。',
        regeneratedProposal: {
          status: 'NEEDS_CONTEXT',
          reason: '使うAIツールの確認が必要',
          questions: ['使いたいAIツールはありますか？'],
          outcome: '',
          explanation: '',
          example: '',
          practice: [],
          evidence: [],
          criteria: [],
        },
        environmentCapture: { deviceType: 'PC', toolDescription: 'ChatGPT' },
      },
      measurement: {
        provider: 'openai',
        model: 'synthetic',
        inputTokens: 1,
        outputTokens: 1,
        cachedInputTokens: 0,
        latencyMs: 1,
        success: true,
        errorCategory: null,
        validationResult: 'VALID',
        fallbackUsed: false,
        occurredAt: '2026-10-17T00:00:00.000Z',
      },
      requestFinished: true,
    });

    await sendPersonalLearningConversationTurn(command);

    expect(f.body).toHaveBeenCalledWith(expect.objectContaining({ candidate: currentCandidate }));
    expect(f.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        regeneratedCandidate: expect.objectContaining({
          expectedCandidateId: 'candidate-old',
          environmentCapture: { deviceType: 'PC', toolDescription: 'ChatGPT' },
        }),
      }),
    );
    expect(wish.originalText).toBe('AIで業務を効率化したい');
  });

  it('uses only the reply when AI returns an unnecessary proposal for a candidate that needs no context', async () => {
    const unsolicitedProposal = {
      status: 'READY',
      reason: '提案',
      questions: [],
      outcome: '成果',
      explanation: '説明',
      example: '例',
      practice: ['一歩'],
      evidence: ['証拠'],
      criteria: ['基準'],
    };
    f.generate.mockResolvedValueOnce({
      value: {
        status: 'ANSWER',
        message: '短い返事だけを使います。',
        regeneratedProposal: unsolicitedProposal,
        environmentCapture: { deviceType: 'PC', toolDescription: 'ChatGPT' },
      },
      measurement: {
        provider: 'openai',
        model: 'synthetic',
        inputTokens: 1,
        outputTokens: 1,
        cachedInputTokens: 0,
        latencyMs: 1,
        success: true,
        errorCategory: null,
        validationResult: 'VALID',
        fallbackUsed: false,
        occurredAt: '2026-10-17T00:00:00.000Z',
      },
      requestFinished: true,
    });
    await sendPersonalLearningConversationTurn(command);
    expect(f.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        response: '短い返事だけを使います。',
      }),
    );
    expect(f.complete.mock.calls[0]?.[0]).not.toHaveProperty('regeneratedCandidate');
    expect(f.fail).not.toHaveBeenCalled();
  });

  it('selects extended proposal guidance from the server-side Program feature only', async () => {
    f.extendedScope.mockResolvedValue(true);
    await sendPersonalLearningConversationTurn(command);
    expect(f.body).toHaveBeenCalledWith(expect.objectContaining({ extendedScope: true }));
    expect(f.complete).toHaveBeenCalledWith(
      expect.objectContaining({ promptVersion: 'conversation-v3' }),
    );
  });

  it('fails closed if existing admission limits are absent and does not call AI', async () => {
    vi.stubEnv('PERSONAL_LEARNING_LESSON_ADMISSION', '');
    await expect(sendPersonalLearningConversationTurn(command)).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
    });
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.fail).toHaveBeenCalledWith(command);
  });

  it('does not apply an uncertain provider failure', async () => {
    f.admission.mockResolvedValue({ reservedCostUsdMicros: 100n, settledAt: null });
    f.generate.mockRejectedValue(new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'private'));
    await expect(sendPersonalLearningConversationTurn(command)).rejects.toThrow();
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.fail).toHaveBeenCalledWith(command);
    expect(f.settle).not.toHaveBeenCalled();
  });
});
