import { describe, expect, it, vi } from 'vitest';
import { PrismaAiProviderConfigurationRepository } from '../src/provider-configurations';

describe('PrismaAiProviderConfigurationRepository', () => {
  it('counts all unknown-cost events in the current UTC month for runtime gating', async () => {
    const now = new Date('2026-10-10T12:00:00.000Z');
    const dailyFrom = new Date('2026-10-10T00:00:00.000Z');
    const monthlyFrom = new Date('2026-10-01T00:00:00.000Z');
    const aggregate = vi
      .fn()
      .mockResolvedValueOnce({ _sum: { estimatedCostUsdMicros: 100n } })
      .mockResolvedValueOnce({ _sum: { estimatedCostUsdMicros: 200n } });
    const count = vi.fn().mockResolvedValue(3);
    const client = {
      aiProviderConfiguration: {
        findFirst: vi.fn().mockResolvedValue({
          id: '11111111-1111-4111-8111-111111111111',
          environment: 'PRODUCTION',
          provider: 'OPENAI',
          version: 1,
          status: 'ACTIVE',
          encryptedApiKey: 'sealed',
          apiKeyMask: '•••1234',
          model: 'gpt-5-mini',
          dailyBudgetUsdMicros: 1_000_000,
          monthlyBudgetUsdMicros: 10_000_000,
          requestCostUsdMicros: 0,
          globallyPaused: false,
          keyVersion: 1,
          lastVerifiedAt: now,
          lastErrorCategory: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
      aiUsageEvent: { aggregate, count },
    };

    await expect(
      new PrismaAiProviderConfigurationRepository(client as never).getActiveForRuntime({
        environment: 'PRODUCTION',
        provider: 'OPENAI',
        dailyFrom,
        monthlyFrom,
        now,
      }),
    ).resolves.toMatchObject({
      dailySpentUsdMicros: 100,
      monthlySpentUsdMicros: 200,
      monthlyUnknownCostEvents: 3,
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        provider: 'openai',
        estimatedCostUsdMicros: null,
        occurredAt: { gte: monthlyFrom, lt: now },
      },
    });
  });
});
