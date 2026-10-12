import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reserveConfiguration: vi.fn(),
  recordUsage: vi.fn(),
  withQuota: vi.fn(),
}));

vi.mock('../src/ai/runtime-provider-configuration', () => ({
  reserveOpenAiRuntimeConfiguration: mocks.reserveConfiguration,
}));
vi.mock('../src/ai/openai-cost-admission', () => ({
  recordOpenAiUsageAndSettle: mocks.recordUsage,
}));
vi.mock('../src/observability/ai-usage', () => ({
  recordAiUsageSafely: mocks.recordUsage,
}));
vi.mock('../src/organization-ai-generation-quota', () => ({
  withOrganizationAiGenerationQuota: mocks.withQuota,
}));

import { createDailyMissionAiRuntime } from '../src/services/daily-mission-ai-runtime';

describe('daily mission AI runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveConfiguration.mockResolvedValue({
      apiKey: 'test-key',
      model: 'test-model',
      requestCostUsdMicros: 275,
      source: 'ADMIN_CONFIGURATION',
      admission: { provider: 'OPENAI' },
    });
    mocks.recordUsage.mockResolvedValue(undefined);
    mocks.withQuota.mockImplementation(({ generate }: { generate: () => Promise<unknown> }) =>
      generate(),
    );
  });

  it('uses the same stable prefix and suffix for rebrief quota and Usage idempotency', async () => {
    const runtime = createDailyMissionAiRuntime({
      scope: {
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        bunshinId: 'bunshin-1',
        actorUserId: 'user-1',
      },
      usageIdempotencyPrefix: 'generation-key-1',
    });
    const generated = {
      model: 'test-model',
      promptVersion: 'daily-mission-rebrief-v1',
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 20,
    };

    await runtime.execute({
      suffix: 'decision-rebrief:1',
      taskType: 'DAILY_MISSION_REBRIEF',
      promptVersion: 'daily-mission-rebrief-v1',
      generate: () => Promise.resolve(generated),
    });

    expect(mocks.withQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        operationKey: 'generation-key-1:decision-rebrief:1',
      }),
    );
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'test-model' }),
      expect.objectContaining({
        taskType: 'DAILY_MISSION_REBRIEF',
        estimatedCostUsdMicros: 275,
        pricingVersion: 'admin-request-cost-v1',
        idempotencyKey: 'generation-key-1:decision-rebrief:1',
      }),
    );
  });

  it('keeps cost unknown when no reviewed request estimate is configured', async () => {
    mocks.reserveConfiguration.mockResolvedValue({
      apiKey: 'test-key',
      model: 'test-model',
      requestCostUsdMicros: 0,
      source: 'ADMIN_CONFIGURATION',
      admission: { provider: 'OPENAI' },
    });
    const runtime = createDailyMissionAiRuntime({
      scope: {
        workspaceId: 'workspace-1',
        bunshinId: 'bunshin-1',
        actorUserId: 'user-1',
      },
      usageIdempotencyPrefix: 'generation-key-2',
    });

    await runtime.execute({
      suffix: 'daily-brief',
      taskType: 'DAILY_MISSION_PLANNER',
      promptVersion: 'daily-mission-planner-v1',
      generate: () =>
        Promise.resolve({
          model: 'test-model',
          promptVersion: 'daily-mission-planner-v1',
          inputTokens: 10,
          outputTokens: 5,
          latencyMs: 20,
        }),
    });

    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'test-model' }),
      expect.objectContaining({
        estimatedCostUsdMicros: null,
        pricingVersion: null,
      }),
    );
  });
});
