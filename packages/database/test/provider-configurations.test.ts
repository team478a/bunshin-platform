import { describe, expect, it, vi } from 'vitest';
import { PrismaAiProviderConfigurationRepository } from '../src/provider-configurations';

describe('PrismaAiProviderConfigurationRepository', () => {
  it('refuses to activate a verified configuration without a positive request cost', async () => {
    const now = new Date('2026-10-10T12:00:00.000Z');
    const target = {
      id: '11111111-1111-4111-8111-111111111111',
      environment: 'PRODUCTION',
      provider: 'OPENAI',
      version: 1,
      status: 'DRAFT',
      encryptedApiKey: 'sealed',
      apiKeyMask: '•••1234',
      model: 'gpt-5-mini',
      dailyBudgetUsdMicros: 1_000_000,
      monthlyBudgetUsdMicros: 10_000_000,
      requestCostUsdMicros: 0,
      globallyPaused: true,
      keyVersion: 1,
      lastVerifiedAt: now,
      lastErrorCategory: null,
      createdAt: now,
      updatedAt: now,
    };
    const transactionClient = {
      aiProviderConfiguration: {
        findFirst: vi.fn().mockResolvedValue(target),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
      aiProviderConfigurationAudit: { create: vi.fn() },
    };
    const transaction = vi.fn((operation: (tx: typeof transactionClient) => Promise<unknown>) =>
      operation(transactionClient),
    );
    const client = {
      platformAdmin: {
        findFirst: vi.fn().mockResolvedValue({ role: 'SUPER_ADMIN' }),
      },
      $transaction: transaction,
    };

    await expect(
      new PrismaAiProviderConfigurationRepository(client as never).activate({
        actorUserId: '22222222-2222-4222-8222-222222222222',
        configurationId: target.id,
        environment: 'PRODUCTION',
        reason: '原価設定なしでは有効化しない',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'provider request cost is required',
    });
    expect(transactionClient.aiProviderConfiguration.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.aiProviderConfiguration.update).not.toHaveBeenCalled();
    expect(transactionClient.aiProviderConfigurationAudit.create).not.toHaveBeenCalled();
  });

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
