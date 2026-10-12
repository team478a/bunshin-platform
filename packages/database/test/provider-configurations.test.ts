import { createHash } from 'node:crypto';
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

  it('reserves the next provider cost under the shared database lock', async () => {
    const now = new Date('2026-10-11T12:00:00.000Z');
    const operationHash = createHash('sha256').update('trend:week:1').digest('hex');
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      environment: 'PRODUCTION',
      provider: 'EXA',
      version: 1,
      status: 'ACTIVE',
      encryptedApiKey: 'sealed',
      apiKeyMask: '•••1234',
      model: null,
      dailyBudgetUsdMicros: 1_000,
      monthlyBudgetUsdMicros: 10_000,
      requestCostUsdMicros: 250,
      globallyPaused: false,
      keyVersion: 1,
      lastVerifiedAt: now,
      lastErrorCategory: null,
      createdAt: now,
      updatedAt: now,
    };
    const transactionClient = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValue([{ now }]),
      aiProviderConfiguration: { findFirst: vi.fn().mockResolvedValue(row) },
      aiUsageEvent: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { estimatedCostUsdMicros: 100n } })
          .mockResolvedValueOnce({ _sum: { estimatedCostUsdMicros: 500n } }),
        count: vi.fn().mockResolvedValue(0),
      },
      aiProviderCallAdmission: {
        findUnique: vi.fn().mockResolvedValue(null),
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { reservedCostUsdMicros: 200n } })
          .mockResolvedValueOnce({ _sum: { reservedCostUsdMicros: 300n } }),
        create: vi.fn().mockResolvedValue({
          id: '33333333-3333-4333-8333-333333333333',
          environment: 'PRODUCTION',
          provider: 'EXA',
          operationHash,
        }),
      },
    };
    const client = {
      $transaction: vi.fn((operation: (tx: typeof transactionClient) => Promise<unknown>) =>
        operation(transactionClient),
      ),
    };

    const result = await new PrismaAiProviderConfigurationRepository(
      client as never,
    ).reserveActiveForRuntime({
      environment: 'PRODUCTION',
      provider: 'EXA',
      operationKey: 'trend:week:1',
      requestCount: 2,
    });

    expect(result).toMatchObject({
      dailySpentUsdMicros: 300,
      monthlySpentUsdMicros: 800,
      admission: {
        environment: 'PRODUCTION',
        provider: 'EXA',
        operationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(transactionClient.$executeRaw).toHaveBeenCalledOnce();
    expect(transactionClient.aiProviderCallAdmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        configurationId: row.id,
        reservedCostUsdMicros: 500n,
        admittedAt: now,
      }),
    });
  });

  it('recovers only an open reservation with a matching known-cost usage event', async () => {
    const operationKey = 'daily:mission:known';
    const row = {
      id: '33333333-3333-4333-8333-333333333333',
      configurationId: '11111111-1111-4111-8111-111111111111',
      provider: 'OPENAI' as const,
      operationHash: createHash('sha256').update(operationKey).digest('hex'),
      admittedAt: new Date('2026-10-11T10:00:00.000Z'),
    };
    const transactionClient = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      aiProviderCallAdmission: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      aiProviderConfigurationAudit: { create: vi.fn().mockResolvedValue({}) },
    };
    const client = {
      platformAdmin: { findFirst: vi.fn().mockResolvedValue({ role: 'SUPER_ADMIN' }) },
      aiProviderCallAdmission: {
        findMany: vi.fn().mockResolvedValue([row]),
        count: vi.fn().mockResolvedValue(0),
      },
      aiUsageEvent: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { idempotencyKey: operationKey },
            { idempotencyKey: 'different-operation' },
          ]),
      },
      $transaction: vi.fn((operation: (tx: typeof transactionClient) => Promise<unknown>) =>
        operation(transactionClient),
      ),
    };

    await expect(
      new PrismaAiProviderConfigurationRepository(client as never).recoverRecordedRuntimeAdmissions(
        {
          actorUserId: '22222222-2222-4222-8222-222222222222',
          environment: 'PRODUCTION',
          reason: '使用量記録済み予約の精算を復旧',
        },
      ),
    ).resolves.toEqual({ scanned: 1, recovered: 1, remainingOpen: 0 });
    expect(transactionClient.aiProviderCallAdmission.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: row.id, operationHash: row.operationHash }),
      data: { settledAt: expect.any(Date) },
    });
    expect(transactionClient.aiProviderConfigurationAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'RECOVER_RUNTIME_ADMISSION' }),
    });
  });

  it('rejects a concurrent reservation when open cost consumes the remainder', async () => {
    const now = new Date('2026-10-11T12:00:00.000Z');
    const transactionClient = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValue([{ now }]),
      aiProviderConfiguration: {
        findFirst: vi.fn().mockResolvedValue({
          id: '11111111-1111-4111-8111-111111111111',
          environment: 'PRODUCTION',
          provider: 'EXA',
          version: 1,
          status: 'ACTIVE',
          encryptedApiKey: 'sealed',
          apiKeyMask: '•••1234',
          model: null,
          dailyBudgetUsdMicros: 500,
          monthlyBudgetUsdMicros: 5_000,
          requestCostUsdMicros: 250,
          globallyPaused: false,
          keyVersion: 1,
          lastVerifiedAt: now,
          lastErrorCategory: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
      aiUsageEvent: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { estimatedCostUsdMicros: 0n } }),
        count: vi.fn().mockResolvedValue(0),
      },
      aiProviderCallAdmission: {
        findUnique: vi.fn().mockResolvedValue(null),
        aggregate: vi.fn().mockResolvedValue({ _sum: { reservedCostUsdMicros: 300n } }),
        create: vi.fn(),
      },
    };
    const client = {
      $transaction: vi.fn((operation: (tx: typeof transactionClient) => Promise<unknown>) =>
        operation(transactionClient),
      ),
    };

    await expect(
      new PrismaAiProviderConfigurationRepository(client as never).reserveActiveForRuntime({
        environment: 'PRODUCTION',
        provider: 'EXA',
        operationKey: 'trend:week:2',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'daily provider budget reached' });
    expect(transactionClient.aiProviderCallAdmission.create).not.toHaveBeenCalled();
  });
});
