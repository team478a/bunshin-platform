import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  recordSafely: vi.fn(),
  settle: vi.fn(),
}));

vi.mock('../src/observability/ai-usage', () => ({
  recordAiUsage: mocks.record,
  recordAiUsageSafely: mocks.recordSafely,
}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  settleProviderRuntimeAdmission: mocks.settle,
}));

import { recordOpenAiUsageAndSettle } from '../src/ai/openai-cost-admission';

const usage = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
  bunshinId: null,
  taskType: 'TEST',
  provider: 'openai',
  model: 'test-model',
  promptVersion: 'test-v1',
  status: 'SUCCESS' as const,
  inputTokens: 1,
  outputTokens: 1,
  latencyMs: 1,
  estimatedCostUsdMicros: 10,
  idempotencyKey: 'test-operation',
};
const runtime = {
  apiKey: 'test-key',
  model: 'test-model',
  requestCostUsdMicros: 10,
  source: 'ADMIN_CONFIGURATION' as const,
  admission: {
    id: '33333333-3333-4333-8333-333333333333',
    environment: 'DEVELOPMENT' as const,
    provider: 'OPENAI' as const,
    operationHash: 'a'.repeat(64),
  },
};

describe('OpenAI cost admission settlement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('settles only after the canonical usage row is durable', async () => {
    mocks.record.mockResolvedValue(undefined);
    await recordOpenAiUsageAndSettle(runtime, usage);
    expect(mocks.record.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.settle.mock.invocationCallOrder[0]!,
    );
    expect(mocks.settle).toHaveBeenCalledWith(runtime.admission);
  });

  it('retains the reservation when usage persistence fails', async () => {
    mocks.record.mockRejectedValue(new Error('db unavailable'));
    await expect(recordOpenAiUsageAndSettle(runtime, usage)).rejects.toThrow('db unavailable');
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('keeps the development-only legacy fallback best effort', async () => {
    await recordOpenAiUsageAndSettle({ ...runtime, admission: null }, usage);
    expect(mocks.recordSafely).toHaveBeenCalledWith(usage);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
});
