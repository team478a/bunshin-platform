import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readState: vi.fn(),
  saveProposal: vi.fn(),
  execute: vi.fn(),
  generate: vi.fn(),
  resolveContext: vi.fn(),
  resolveRuntime: vi.fn(),
  reserveRuntime: vi.fn(),
  pricing: vi.fn(),
  reserved: vi.fn(),
  operationHash: vi.fn(),
  parseAdmission: vi.fn(),
}));

vi.mock('@bunshin/database', () => ({
  PrismaSideHustleHearingRepository: class {
    readState = mocks.readState;
    saveProposal = mocks.saveProposal;
  },
  PrismaPersonalLearningTextOperationRepository: class {},
  personalLearningOperationHash: mocks.operationHash,
  prisma: { personalLearningCallAdmission: { findUnique: mocks.reserved, findFirst: vi.fn() } },
}));
vi.mock('@bunshin/application', async (original) => ({
  ...(await (original as () => Promise<Record<string, unknown>>)()),
  executePersonalLearningTextOperation: mocks.execute,
  reservePersonalLearningCallCost: () => ({ reservedCostUsdMicros: 1 }),
  parsePersonalLearningCallAdmissionPolicy: mocks.parseAdmission,
}));
vi.mock('../src/services/personal-learning-extended-scope', () => ({
  resolvePersonalLearningOfferContext: mocks.resolveContext,
}));
vi.mock('../src/ai/learning-provider-runtime', () => ({
  resolveLearningProviderRuntimeConfiguration: mocks.resolveRuntime,
  reserveLearningProviderRuntimeConfiguration: mocks.reserveRuntime,
}));
vi.mock('../src/observability/personal-learning-ai-call', () => ({
  personalLearningPricingRegistry: mocks.pricing,
}));
vi.mock('../src/providers/openai-side-hustle-proposal', () => ({
  sideHustleProposalBody: (input: unknown) => JSON.stringify(input),
  generateSideHustleProposal: mocks.generate,
}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  settleProviderRuntimeAdmission: vi.fn(),
}));

import { ApplicationError } from '@bunshin/shared';
import { prepareSideHustleProposal } from '../src/services/side-hustle-proposal';

const actor = {
  actorUserId: '11111111-1111-4111-8111-111111111111',
  scope: {
    workspaceId: 'workspace',
    groupId: 'group',
    programEnrollmentId: 'enrollment',
    groupMembershipId: 'membership',
    userId: 'user',
  },
};
const hearing = {
  id: '22222222-2222-4222-8222-222222222222',
  revision: 1,
  hearing: {
    conditions: {
      initialBudget: null,
      monthlyBudget: null,
      weeklyHours: null,
      faceExposure: null,
      snsPosting: null,
      clientInteraction: null,
      salesOutreach: null,
      inventory: null,
      device: null,
    },
    freeText: {
      goal: '得意なことを活かしたい',
      experience: null,
      interest: null,
      constraint: null,
    },
    followUps: [],
  },
};
const proposal = {
  status: 'NO_FIT',
  reason: '今の条件では、安全に提案できる副業が見つかりませんでした。',
  questions: [],
  candidates: [],
};

describe('side hustle proposal service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readState.mockResolvedValue({ hearing, proposal: null, selection: null });
    mocks.saveProposal.mockResolvedValue({
      id: 'proposal-event',
      hearingEventId: hearing.id,
      hearingRevision: hearing.revision,
      proposal,
      screening: {
        ruleVersion: 'SIDE_HUSTLE_SCREENING_V2',
        candidateContractVersion: 'SIDE_HUSTLE_CANDIDATE_V1',
        missingConditions: [],
        entries: [],
      },
      promptVersion: 'side-hustle-candidates-v1',
      usageKey: `personal-learning-operation:${'a'.repeat(64)}`,
      createdAt: new Date().toISOString(),
    });
    mocks.resolveContext.mockResolvedValue({ offerPolicy: 'SIDE_HUSTLE_V1', extendedScope: false });
    mocks.resolveRuntime.mockResolvedValue({
      provider: 'openai',
      apiKey: 'secret',
      model: 'gpt-5.2',
      modelCapabilities: ['STRUCTURED_OUTPUT'],
      admission: null,
    });
    mocks.reserveRuntime.mockResolvedValue({
      provider: 'openai',
      apiKey: 'secret',
      model: 'gpt-5.2',
      modelCapabilities: ['STRUCTURED_OUTPUT'],
      admission: null,
    });
    mocks.pricing.mockReturnValue([]);
    mocks.parseAdmission.mockReturnValue({
      workspaceId: 'workspace',
      groupId: 'group',
      serviceProgramId: 'program',
      provider: 'openai',
      model: 'gpt-5.2',
      maxRequestBytes: 16000,
      maxOutputTokens: 1200,
      dailyAttemptLimit: 5,
      maxConcurrent: 1,
      dailyCostLimitUsdMicros: 10000,
    });
    mocks.reserved.mockResolvedValue({ reservedCostUsdMicros: 1n });
    mocks.operationHash.mockReturnValue('b'.repeat(64));
    mocks.execute.mockImplementation(
      async (
        _repo,
        _operation,
        call: (permit: {
          id: string;
          operationHash: string;
          maxRequestBytes: number;
          maxOutputTokens: number;
        }) => Promise<{
          measurement: { success: boolean };
          requestFinished: boolean;
          value: unknown;
        }>,
      ) => {
        const result = await call({
          id: 'permit',
          operationHash: 'b'.repeat(64),
          maxRequestBytes: 16000,
          maxOutputTokens: 1200,
        });
        if (!result.measurement.success || !result.requestFinished)
          throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'failed');
        return result.value;
      },
    );
    mocks.generate.mockResolvedValue({
      value: proposal,
      measurement: {
        provider: 'openai',
        model: 'gpt-5.2',
        inputTokens: 100,
        outputTokens: 30,
        cachedInputTokens: 0,
        latencyMs: 20,
        success: true,
        errorCategory: null,
        validationResult: 'PASSED',
        fallbackUsed: false,
        occurredAt: new Date().toISOString(),
      },
      requestFinished: true,
    });
  });

  it('returns the saved proposal on repeat and calls the Provider only once', async () => {
    const first = await prepareSideHustleProposal(
      actor,
      hearing.id,
      hearing.revision,
      '33333333-3333-4333-8333-333333333333',
    );
    mocks.readState.mockResolvedValue({ hearing, proposal: first, selection: null });
    const second = await prepareSideHustleProposal(
      actor,
      hearing.id,
      hearing.revision,
      '44444444-4444-4444-8444-444444444444',
    );
    expect(second).toBe(first);
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.saveProposal).toHaveBeenCalledOnce();
  });

  it('rejects a missing goal before any Provider call', async () => {
    mocks.readState.mockResolvedValue({
      hearing: {
        ...hearing,
        hearing: { ...hearing.hearing, freeText: { ...hearing.hearing.freeText, goal: null } },
      },
      proposal: null,
      selection: null,
    });
    await expect(
      prepareSideHustleProposal(
        actor,
        hearing.id,
        hearing.revision,
        '33333333-3333-4333-8333-333333333333',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('does not save malformed Provider output', async () => {
    mocks.generate.mockResolvedValue({
      value: null,
      measurement: {
        provider: 'openai',
        model: 'gpt-5.2',
        inputTokens: 10,
        outputTokens: 0,
        cachedInputTokens: 0,
        latencyMs: 20,
        success: false,
        errorCategory: 'INVALID_RESPONSE',
        validationResult: 'FAILED',
        fallbackUsed: false,
        occurredAt: new Date().toISOString(),
      },
      requestFinished: true,
    });
    await expect(
      prepareSideHustleProposal(
        actor,
        hearing.id,
        hearing.revision,
        '33333333-3333-4333-8333-333333333333',
      ),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
    expect(mocks.saveProposal).not.toHaveBeenCalled();
  });

  it('rejects an invalid offer policy before Provider admission', async () => {
    mocks.readState.mockRejectedValue(new ApplicationError('NOT_FOUND', 'side hustle unavailable'));
    await expect(
      prepareSideHustleProposal(
        actor,
        hearing.id,
        hearing.revision,
        '33333333-3333-4333-8333-333333333333',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('does not call a Provider when admission denies a daily-limit call', async () => {
    mocks.execute.mockRejectedValue(
      new ApplicationError('CONFLICT', 'daily proposal limit reached'),
    );
    await expect(
      prepareSideHustleProposal(
        actor,
        hearing.id,
        hearing.revision,
        '33333333-3333-4333-8333-333333333333',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.saveProposal).not.toHaveBeenCalled();
  });
});
