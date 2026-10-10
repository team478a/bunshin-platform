import { describe, expect, it, vi } from 'vitest';
import { PrismaAdminAlertRepository } from '../src/admin-alerts';

const now = new Date('2026-10-10T02:00:00.000Z');

describe('PrismaAdminAlertRepository', () => {
  it('counts provider failures separately and exposes unknown-cost events', async () => {
    const aiUsageCount = vi
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        'status' in where ? 3 : 5,
      );
    const client = {
      platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: 'admin-a' }) },
      aiProviderConfiguration: {
        findMany: vi.fn().mockResolvedValue([
          {
            provider: 'OPENAI',
            globallyPaused: false,
            lastErrorCategory: null,
            dailyBudgetUsdMicros: 1_000_000n,
            monthlyBudgetUsdMicros: 10_000_000n,
          },
        ]),
      },
      lineChannelConfiguration: {
        findFirst: vi.fn().mockResolvedValue({
          lastVerifiedAt: now,
          lastErrorCategory: null,
          globallyPaused: false,
        }),
      },
      lineNotificationPreference: { findMany: vi.fn().mockResolvedValue([]) },
      lineMessageDelivery: { count: vi.fn().mockResolvedValue(0) },
      job: {
        groupBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      pointProcessingEvent: { count: vi.fn().mockResolvedValue(0) },
      badgeProcessingEvent: { count: vi.fn().mockResolvedValue(0) },
      serviceConfiguration: { count: vi.fn().mockResolvedValue(0) },
      accountDeletionRequest: { count: vi.fn().mockResolvedValue(0) },
      supportCase: { count: vi.fn().mockResolvedValue(0) },
      aiUsageEvent: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { estimatedCostUsdMicros: 0n } }),
        count: aiUsageCount,
      },
    };

    const snapshot = await new PrismaAdminAlertRepository(client as never).snapshot({
      actorUserId: 'user-a',
      environment: 'PRODUCTION',
      now,
      dailyFrom: new Date('2026-10-10T00:00:00.000Z'),
      monthlyFrom: new Date('2026-10-01T00:00:00.000Z'),
      recentFrom: new Date('2026-10-09T02:00:00.000Z'),
    });

    expect(snapshot?.ai[0]).toMatchObject({
      provider: 'OPENAI',
      recentProviderFailures: 3,
      recentUnknownCostEvents: 5,
    });
    expect(aiUsageCount).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          provider: 'openai',
          status: 'FAILED',
          OR: expect.arrayContaining([
            { errorCode: { startsWith: 'AI_PROVIDER_' } },
            expect.objectContaining({
              errorCode: expect.objectContaining({
                in: expect.arrayContaining(['PROVIDER_ERROR', 'TIMEOUT', 'RATE_LIMIT']),
              }),
            }),
          ]),
        }),
      }),
    );
    expect(aiUsageCount).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          provider: 'openai',
          estimatedCostUsdMicros: null,
        }),
      }),
    );
  });
});
