import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@bunshin/database';
import {
  fortuneRevenue,
  saveAdvertisingSpend,
  saveVerifiedStripeFee,
} from '../src/fortune/revenue';

describe('fortune revenue', () => {
  it('leaves missing advertising spend and fees unrecorded', async () => {
    const db = {} as PrismaClient;
    const scope = { workspaceId: 'workspace', groupId: 'service' };
    await expect(
      saveAdvertisingSpend(db, scope, {
        month: '2026-11',
        channel: 'newsletter',
        amountYen: '',
      }),
    ).rejects.toMatchObject({ name: 'ZodError' });
    await expect(
      saveVerifiedStripeFee(db, scope, {
        purchaseId: 'adbd8a53-89a4-4a50-bdd0-230579ab7218',
        amountYen: null,
      }),
    ).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('separates known revenue from unavailable fees, advertising and AI costs', async () => {
    const purchasedAt = new Date('2026-11-15T00:00:00Z');
    const listPurchases = vi.fn().mockResolvedValue([
      {
        id: 'one',
        buyerUserId: 'user',
        productName: 'Review',
        amountYen: 1980,
        paidAt: purchasedAt,
        createdAt: purchasedAt,
        deliveredAt: purchasedAt,
        refundedAt: null,
        stripeFeeYen: null,
        acquisitionChannel: 'newsletter',
        refunds: [],
      },
    ]);
    const db = {
      fortuneServiceSetting: {
        findFirst: vi.fn().mockResolvedValue({ id: 'service', bunshinId: 'bunshin' }),
      },
      fortuneCommercePurchase: { findMany: listPurchases },
      serviceMembershipEvent: { findMany: vi.fn().mockResolvedValue([]) },
      aiUsageEvent: { findMany: vi.fn().mockResolvedValue([]) },
      fortuneAdvertisingSpend: { findMany: vi.fn().mockResolvedValue([]) },
      fortuneAcquisitionVisit: { groupBy: vi.fn().mockResolvedValue([]) },
      fortuneFeedback: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;
    const result = await fortuneRevenue(
      db,
      { workspaceId: 'workspace', groupId: 'service' },
      {
        month: '2026-11',
        fx: 150,
        liveMode: false,
      },
    );
    expect(result.total).toMatchObject({
      gross: 1980,
      fees: null,
      allAiKnown: false,
      margin: null,
    });
    expect(result).toMatchObject({
      adTotal: null,
      cac: null,
      observedLtvRevenue: 1980,
      observedLtvMargin: null,
    });
    expect(result.channels).toMatchObject([
      { channel: 'newsletter', acquired: 1, advertisingCost: null },
    ]);
    expect(listPurchases).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace',
          groupId: 'service',
          liveMode: false,
        }),
      }),
    );
  });
});
