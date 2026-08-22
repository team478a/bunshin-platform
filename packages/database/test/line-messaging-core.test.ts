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
