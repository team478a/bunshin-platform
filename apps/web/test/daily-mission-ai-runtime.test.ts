import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordUsage: vi.fn(),
  withQuota: vi.fn(),
}));

vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: vi
    .fn()
    .mockResolvedValue({ apiKey: 'test-key', model: 'test-model' }),
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
    mocks.recordUsage.mockResolvedValue(undefined);
    mocks.withQuota.mockImplementation(({ generate }: { generate: () => Promise<unknown> }) =>
      generate(),
    );
  });

  it('uses the same stable prefix and suffix for rebrief quota and Usage idempotency', async () => {
    const runtime = await createDailyMissionAiRuntime({
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

    await runtime.generateWithQuota('decision-rebrief:1', () => Promise.resolve(generated));
    await runtime.recordUsage('decision-rebrief:1', 'DAILY_MISSION_REBRIEF', generated);

    expect(mocks.withQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        operationKey: 'generation-key-1:decision-rebrief:1',
      }),
    );
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'DAILY_MISSION_REBRIEF',
        idempotencyKey: 'generation-key-1:decision-rebrief:1',
      }),
    );
  });
});
