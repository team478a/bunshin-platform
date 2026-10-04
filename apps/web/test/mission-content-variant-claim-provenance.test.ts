import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  claim: vi.fn(),
  fail: vi.fn(),
  context: vi.fn(),
  record: vi.fn(),
  generate: vi.fn(),
  list: vi.fn(),
}));
const generationId = '00000000-0000-4000-8000-000000000001';
vi.mock('@bunshin/application', async (original) => ({
  ...(await original<object>()),
  RequireActiveBunshinCapability: class {
    execute() {
      return Promise.resolve();
    }
  },
  GetGenerationContextSnapshot: class {
    execute() {
      return Promise.resolve({ payload: { classification: 'EVERGREEN' } });
    }
  },
}));
vi.mock('@bunshin/capability-social', async (original) => ({
  ...(await original<object>()),
  GetDailyMission: class {
    execute() {
      return Promise.resolve({
        id: 'mission',
        missionDate: '2026-10-03',
        classification: 'EVERGREEN',
        campaignId: null,
      });
    }
  },
  ListDailyMissions: class {
    execute() {
      return Promise.resolve([]);
    }
  },
  AuthorizeDailyMissionCopy: class {
    execute() {
      return Promise.resolve({ allowed: true });
    }
  },
  ClaimMissionContentVariantGeneration: class {
    execute = state.claim;
  },
  FailMissionContentVariantGeneration: class {
    execute = state.fail;
  },
  ListMissionContentVariants: class {
    execute = state.list;
  },
}));
vi.mock('@bunshin/database', () => ({
  PrismaDailyMissionRepository: class {},
  PrismaMissionContentVariantRepository: class {},
  PrismaBunshinCapabilityAssignmentRepository: class {},
  PrismaGenerationContextSnapshotRepository: class {},
}));
vi.mock('../src/services/mission-content-variant-context', () => ({
  loadMissionContentVariantContext: state.context,
}));
vi.mock('../src/observability/ai-usage', () => ({ recordAiUsageSafely: state.record }));
vi.mock('../src/services/mission-content-variant-ai-runtime', () => ({
  createMissionContentVariantUsageState: () => ({
    runtimeModel: 'dummy',
    totalInputTokens: 0,
    totalOutputTokens: 0,
    hasInputTokens: false,
    hasOutputTokens: false,
    estimatedCostMicros: 0,
    qualityAttempts: [],
    qualityRepairCount: 0,
  }),
  generateMissionContentVariantWithAi: state.generate,
}));
import { MissionContentVariantGenerationService } from '../src/services/mission-content-variant-generation';
const input = {
  workspaceId: 'workspace',
  groupId: 'hassy',
  bunshinId: 'bunshin',
  actorUserId: 'owner',
  dailyMissionId: 'mission',
  generationIdempotencyKey: 'opaque',
  usageIdempotencyPrefix: 'opaque-usage',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('network forbidden');
    }),
  );
  state.claim.mockResolvedValue({ acquired: true, generation: { id: generationId } });
  state.context.mockRejectedValue(new Error('synthetic context failure before checking'));
  state.record.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
describe('variant orchestration provenance (fake persistence/authorization boundaries)', () => {
  it.each(['PHOTO_FIRST', 'STANDARD'])(
    'claims %s before a pre-quality failure and links its failure observation',
    async (source) => {
      const service = new MissionContentVariantGenerationService();
      await expect(
        source === 'PHOTO_FIRST'
          ? service.executePhotoFirst({ ...input, photoActionId: 'synthetic-photo' })
          : service.execute(input),
      ).rejects.toThrow('synthetic context failure');
      expect(state.claim).toHaveBeenCalledWith(
        expect.objectContaining({ initiatingSource: source }),
      );
      expect(state.record).toHaveBeenCalledWith(
        expect.objectContaining({
          contentVariantGenerationId: generationId,
          taskType: 'MISSION_CONTENT_VARIANT_PIPELINE',
          status: 'FAILED',
          estimatedCostUsdMicros: null,
        }),
      );
      expect(state.fail).toHaveBeenCalledWith(
        expect.objectContaining({
          generationId,
          qualityAudit: { verdict: null, score: null, issueCodes: [], repairCount: 0 },
        }),
      );
      expect(state.generate).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('replays a persisted success using a fresh service without generating again', async () => {
    state.claim.mockResolvedValue({
      acquired: false,
      generation: { id: generationId, status: 'SUCCEEDED', variantId: 'variant' },
    });
    state.list.mockResolvedValue([{ id: 'variant', photoFirst: null }]);
    await new MissionContentVariantGenerationService().execute(input);
    expect(state.context).not.toHaveBeenCalled();
    expect(state.generate).not.toHaveBeenCalled();
    expect(state.record).not.toHaveBeenCalled();
  });
});
