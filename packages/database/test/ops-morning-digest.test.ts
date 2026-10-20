import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaOpsMorningDigestCollector } from '../src/ops-morning-digest';

const window = {
  targetDate: '2026-10-19',
  from: new Date('2026-10-18T15:00:00.000Z'),
  to: new Date('2026-10-19T15:00:00.000Z'),
};

function client(overrides: Record<string, unknown> = {}) {
  const serviceLineBroadcast = { groupBy: vi.fn().mockResolvedValue([]) };
  const serviceConfiguration = { findMany: vi.fn().mockResolvedValue([]) };
  const fortuneServiceSetting = { findMany: vi.fn().mockResolvedValue([]) };
  const tenantInvoice = { groupBy: vi.fn().mockResolvedValue([]) };
  const value = {
    serviceLineBroadcast,
    serviceConfiguration,
    fortuneServiceSetting,
    tenantInvoice,
    ...overrides,
  };
  return {
    value: value as unknown as PrismaClient,
    serviceLineBroadcast,
    serviceConfiguration,
    fortuneServiceSetting,
    tenantInvoice,
  };
}

describe('PrismaOpsMorningDigestCollector', () => {
  it('counts service broadcasts by service and current status using status-specific event timestamps', async () => {
    const db = client();
    db.serviceLineBroadcast.groupBy
      .mockResolvedValueOnce([
        { groupId: 'group-a', status: 'SCHEDULED', _count: { _all: 2 } },
        { groupId: 'group-b', status: 'COMPLETED', _count: { _all: 1 } },
      ] as never)
      .mockResolvedValueOnce([]);
    db.serviceConfiguration.findMany.mockResolvedValue([
      { groupId: 'group-a', displayName: 'Aサービス' },
      { groupId: 'group-b', displayName: 'Bサービス' },
    ] as never);

    const result = await new PrismaOpsMorningDigestCollector(db.value).serviceLineBroadcasts(
      window,
    );

    expect(result.serviceBroadcasts).toEqual({
      status: 'OK',
      value: [
        { serviceName: 'Aサービス', status: 'SCHEDULED', count: 2 },
        { serviceName: 'Bサービス', status: 'COMPLETED', count: 1 },
      ],
    });
    expect(result.fortuneWeeklyBroadcasts.status).toBe('NOT_APPLICABLE');
    expect(db.serviceLineBroadcast.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        by: ['groupId', 'status'],
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { status: 'SCHEDULED', scheduledAt: { gte: window.from, lt: window.to } },
                { status: 'COMPLETED', completedAt: { gte: window.from, lt: window.to } },
                { status: 'CANCELLED', cancelledAt: { gte: window.from, lt: window.to } },
              ],
            },
          ]),
        }),
        _count: { _all: true },
      }),
    );
    expect(db.serviceConfiguration.findMany).toHaveBeenCalledWith({
      where: { groupId: { in: ['group-a', 'group-b'] } },
      select: { groupId: true, displayName: true },
    });
    expect(JSON.stringify(db.serviceConfiguration.findMany.mock.calls)).not.toMatch(
      /operatorName|contactEmail|workspaceName|email/i,
    );
  });

  it('separates fortune-weekly broadcasts and marks the non-delivery day not applicable', async () => {
    const db = client();
    db.serviceLineBroadcast.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { groupId: 'fortune-group', status: 'COMPLETED', _count: { _all: 1 } },
      ] as never);
    db.fortuneServiceSetting.findMany.mockResolvedValue([
      { timeZone: 'Asia/Tokyo', weeklyNotificationDay: 3 },
    ] as never);
    db.serviceConfiguration.findMany.mockResolvedValue([
      { groupId: 'fortune-group', displayName: '占いサービス' },
    ] as never);

    const result = await new PrismaOpsMorningDigestCollector(db.value).serviceLineBroadcasts(
      window,
    );

    expect(result.fortuneWeeklyBroadcasts).toEqual({
      status: 'OK',
      value: [{ serviceName: '占いサービス', status: 'COMPLETED', count: 1 }],
    });
    expect(db.serviceLineBroadcast.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ automationKey: { startsWith: 'fortune-weekly:' } }]),
        }),
      }),
    );

    db.serviceLineBroadcast.groupBy.mockReset().mockResolvedValue([]);
    db.serviceConfiguration.findMany.mockReset().mockResolvedValue([]);
    db.fortuneServiceSetting.findMany
      .mockReset()
      .mockResolvedValue([{ timeZone: 'Asia/Tokyo', weeklyNotificationDay: 3 }] as never);
    const nonDeliveryDay = await new PrismaOpsMorningDigestCollector(
      db.value,
    ).serviceLineBroadcasts(window);
    expect(nonDeliveryDay.fortuneWeeklyBroadcasts).toEqual({
      status: 'NOT_APPLICABLE',
      reason: 'NO_SCHEDULED_FORTUNE_DELIVERY',
    });
  });

  it('groups OEM invoices by status and requests no amounts or counterparty fields', async () => {
    const db = client();
    db.tenantInvoice.groupBy.mockResolvedValue([
      { status: 'ISSUED', _count: { _all: 2 } },
      { status: 'PAID', _count: { _all: 3 } },
    ] as never);

    const result = await new PrismaOpsMorningDigestCollector(db.value).tenantInvoiceStatuses();

    expect(result).toEqual({
      status: 'OK',
      value: [
        { status: 'ISSUED', count: 2 },
        { status: 'PAID', count: 3 },
      ],
    });
    expect(db.tenantInvoice.groupBy).toHaveBeenCalledExactlyOnceWith({
      by: ['status'],
      _count: { _all: true },
    });
    expect(JSON.stringify(db.tenantInvoice.groupBy.mock.calls)).not.toMatch(
      /amountYen|amount_yen|billingName|billingEmail|workspaceName/i,
    );
  });

  it('counts records with missing event timestamps separately without making the collector unavailable', async () => {
    const db = client();
    db.serviceLineBroadcast.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { groupId: 'group-a', status: 'COMPLETED', _count: { _all: 1 } },
      ] as never);

    const result = await new PrismaOpsMorningDigestCollector(db.value).serviceLineBroadcasts(
      window,
    );

    expect(result.serviceBroadcasts).toEqual({ status: 'OK', value: [] });
    expect(result.missingBroadcastDateCount).toEqual({ status: 'OK', value: 1 });
  });

  it('returns a fixed unavailable category instead of a raw database exception', async () => {
    const db = client({
      tenantInvoice: { groupBy: vi.fn().mockRejectedValue(new Error('sensitive SQL details')) },
    });

    const result = await new PrismaOpsMorningDigestCollector(db.value).tenantInvoiceStatuses();

    expect(result).toEqual({ status: 'UNAVAILABLE', errorCategory: 'DATABASE_READ_FAILED' });
    expect(JSON.stringify(result)).not.toContain('sensitive SQL details');
  });
});
