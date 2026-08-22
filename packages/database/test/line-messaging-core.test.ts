import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaLineMessageDeliveryRepository, PrismaMissionDeepLinkStateRepository } from '../src';

const scope = {
  environment: 'PRODUCTION' as const,
  workspaceId: 'workspace-a',
  bunshinId: 'bunshin-a',
  actorUserId: 'user-a',
  dailyMissionId: 'mission-a',
};

describe('LINE messaging persistence isolation', () => {
  it('atomically claims a due delivery with an environment-scoped lease', async () => {
    const now = new Date('2026-08-22T05:00:00Z');
    const leaseExpiresAt = new Date('2026-08-22T05:00:30Z');
    const row = {
      id: 'delivery-a',
      environment: 'PRODUCTION',
      workspaceId: 'workspace-a',
      bunshinId: 'bunshin-a',
      userId: 'user-a',
      dailyMissionId: 'mission-a',
      kind: 'DAILY_MISSION',
      status: 'PROCESSING',
      idempotencyKey: 'mission-a:daily',
      scheduledAt: now,
      sentAt: null,
      cancelledAt: null,
      lastErrorCategory: null,
      attemptCount: 2,
      leaseOwner: 'worker-a',
      leaseExpiresAt,
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      lineMessageDelivery: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(row),
      },
    };
    const client = {
      $transaction: vi
        .fn()
        .mockImplementation((work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaClient;
    await expect(
      new PrismaLineMessageDeliveryRepository(client).claim({
        deliveryId: 'delivery-a',
        environment: 'PRODUCTION',
        actorUserId: 'user-a',
        leaseOwner: 'worker-a',
        now,
        leaseExpiresAt,
      }),
    ).resolves.toEqual({ delivery: row, attemptNumber: 2 });
    expect(tx.lineMessageDelivery.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'delivery-a',
        environment: 'PRODUCTION',
        userId: 'user-a',
        sentAt: null,
        cancelledAt: null,
      }),
      data: expect.objectContaining({
        status: 'PROCESSING',
        attemptCount: { increment: 1 },
        leaseOwner: 'worker-a',
      }),
    });
  });

  it('does not claim when the conditional update loses a race', async () => {
    const tx = {
      lineMessageDelivery: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn(),
      },
    };
    const client = {
      $transaction: vi
        .fn()
        .mockImplementation((work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaClient;
    await expect(
      new PrismaLineMessageDeliveryRepository(client).claim({
        deliveryId: 'delivery-a',
        environment: 'PRODUCTION',
        actorUserId: 'user-a',
        leaseOwner: 'worker-b',
        now: new Date('2026-08-22T05:00:00Z'),
        leaseExpiresAt: new Date('2026-08-22T05:00:30Z'),
      }),
    ).resolves.toBeNull();
    expect(tx.lineMessageDelivery.findFirst).not.toHaveBeenCalled();
  });

  it('records an attempt only for the worker that owns the environment lease', async () => {
    const tx = {
      lineMessageDelivery: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      lineMessageDeliveryAttempt: { create: vi.fn().mockResolvedValue({ id: 'attempt-a' }) },
    };
    const client = {
      $transaction: vi
        .fn()
        .mockImplementation((work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaClient;
    await new PrismaLineMessageDeliveryRepository(client).recordAttempt({
      deliveryId: 'delivery-a',
      environment: 'PRODUCTION',
      leaseOwner: 'worker-a',
      attemptNumber: 2,
      status: 'FAILED',
      errorCategory: 'RATE_LIMITED',
      latencyMs: 100,
      attemptedAt: new Date('2026-08-22T05:00:01Z'),
    });
    expect(tx.lineMessageDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          environment: 'PRODUCTION',
          status: 'PROCESSING',
          leaseOwner: 'worker-a',
          attemptCount: 2,
        }),
      }),
    );
  });

  it('does not prepare a delivery outside the verified actor scope', async () => {
    const create = vi.fn();
    const client = {
      bunshin: { findFirst: vi.fn().mockResolvedValue(null) },
      lineMessageDelivery: { create },
    } as unknown as PrismaClient;
    await expect(
      new PrismaLineMessageDeliveryRepository(client).prepare({
        ...scope,
        kind: 'DAILY_MISSION',
        idempotencyKey: 'mission-a:daily',
        scheduledAt: new Date('2026-08-22T04:00:00Z'),
      }),
    ).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not issue a deep link state outside the verified actor scope', async () => {
    const create = vi.fn();
    const client = {
      bunshin: { findFirst: vi.fn().mockResolvedValue(null) },
      missionDeepLinkState: { create },
    } as unknown as PrismaClient;
    await expect(
      new PrismaMissionDeepLinkStateRepository(client).create({
        ...scope,
        id: '77d8baef-d7de-48d7-975e-c7c0ea4c81bf',
        keyVersion: 1,
        expiresAt: new Date('2026-08-22T04:10:00Z'),
      }),
    ).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('claims a state once using environment, actor, version and exact expiry', async () => {
    const now = new Date('2026-08-22T04:00:00Z');
    const expiresAt = new Date('2026-08-22T04:10:00Z');
    const row = {
      id: '77d8baef-d7de-48d7-975e-c7c0ea4c81bf',
      environment: 'PRODUCTION' as const,
      workspaceId: 'workspace-a',
      bunshinId: 'bunshin-a',
      userId: 'user-a',
      dailyMissionId: 'mission-a',
      keyVersion: 1,
      expiresAt,
      consumedAt: null,
      createdAt: now,
    };
    const tx = {
      missionDeepLinkState: {
        findFirst: vi.fn().mockResolvedValue(row),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const client = {
      $transaction: vi
        .fn()
        .mockImplementation((work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaClient;
    await expect(
      new PrismaMissionDeepLinkStateRepository(client).consume({
        id: row.id,
        environment: 'PRODUCTION',
        actorUserId: 'user-a',
        keyVersion: 1,
        expiresAt,
        now,
      }),
    ).resolves.toEqual({ ...row, consumedAt: now });
    expect(tx.missionDeepLinkState.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: row.id,
        environment: 'PRODUCTION',
        userId: 'user-a',
        keyVersion: 1,
        expiresAt,
        consumedAt: null,
      }),
    });
    expect(tx.missionDeepLinkState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { consumedAt: now } }),
    );
  });

  it('rejects a concurrently consumed state', async () => {
    const now = new Date('2026-08-22T04:00:00Z');
    const tx = {
      missionDeepLinkState: {
        findFirst: vi.fn().mockResolvedValue({
          id: '77d8baef-d7de-48d7-975e-c7c0ea4c81bf',
          environment: 'PRODUCTION',
          workspaceId: 'workspace-a',
          bunshinId: 'bunshin-a',
          userId: 'user-a',
          dailyMissionId: 'mission-a',
          keyVersion: 1,
          expiresAt: new Date('2026-08-22T04:10:00Z'),
          consumedAt: null,
          createdAt: now,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const client = {
      $transaction: vi
        .fn()
        .mockImplementation((work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaClient;
    await expect(
      new PrismaMissionDeepLinkStateRepository(client).consume({
        id: '77d8baef-d7de-48d7-975e-c7c0ea4c81bf',
        environment: 'PRODUCTION',
        actorUserId: 'user-a',
        keyVersion: 1,
        expiresAt: new Date('2026-08-22T04:10:00Z'),
        now,
      }),
    ).resolves.toBeNull();
  });
});
