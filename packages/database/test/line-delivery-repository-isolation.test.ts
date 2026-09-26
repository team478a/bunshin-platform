import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  PrismaLineDeliveryRetryRepository,
  PrismaLineMessageDeliveryRepository,
  PrismaLineMissionNotificationSummaryRepository,
  PrismaMissionDeepLinkStateRepository,
} from '../src';

const scope = {
  environment: 'PRODUCTION' as const,
  workspaceId: 'workspace-a',
  bunshinId: 'bunshin-a',
  actorUserId: 'user-a',
  dailyMissionId: 'mission-a',
};

describe('LINE delivery repository isolation', () => {
  it('loads delivery history only for the actor-owned Bunshin or a workspace administrator', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const client = { lineMessageDelivery: { findFirst } } as unknown as PrismaClient;

    await expect(
      new PrismaLineMessageDeliveryRepository(client).getScoped({
        deliveryId: 'delivery-a',
        ...scope,
      }),
    ).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'delivery-a',
        environment: scope.environment,
        workspaceId: scope.workspaceId,
        bunshinId: scope.bunshinId,
        userId: scope.actorUserId,
        bunshin: {
          status: { not: 'ARCHIVED' },
          OR: [
            { ownerUserId: scope.actorUserId },
            {
              workspace: {
                memberships: {
                  some: {
                    userId: scope.actorUserId,
                    status: 'ACTIVE',
                    role: { in: ['OWNER', 'ADMIN'] },
                  },
                },
              },
            },
          ],
        },
      }),
    });
  });

  it('resolves notification content only through the full actor and Bunshin scope', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const client = { dailyMission: { findFirst } } as unknown as PrismaClient;

    await expect(
      new PrismaLineMissionNotificationSummaryRepository(client).resolve(scope),
    ).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: scope.dailyMissionId,
        workspaceId: scope.workspaceId,
        bunshinId: scope.bunshinId,
        bunshin: expect.objectContaining({
          status: { not: 'ARCHIVED' },
          OR: [
            { ownerUserId: scope.actorUserId },
            {
              workspace: {
                memberships: {
                  some: {
                    userId: scope.actorUserId,
                    status: 'ACTIVE',
                    role: { in: ['OWNER', 'ADMIN'] },
                  },
                },
              },
            },
          ],
        }),
      }),
      select: expect.any(Object),
    });
  });

  it('consumes a deep link only with its signed environment, actor, version and expiry', async () => {
    const expiresAt = new Date('2026-09-26T02:10:00.000Z');
    const tx = {
      missionDeepLinkState: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
      },
    };
    const client = {
      $transaction: vi.fn((work: (value: typeof tx) => unknown) => Promise.resolve(work(tx))),
    } as unknown as PrismaClient;

    await expect(
      new PrismaMissionDeepLinkStateRepository(client).consume({
        id: '77d8baef-d7de-48d7-975e-c7c0ea4c81bf',
        environment: scope.environment,
        actorUserId: scope.actorUserId,
        keyVersion: 2,
        expiresAt,
        now: new Date('2026-09-26T02:00:00.000Z'),
      }),
    ).resolves.toBeNull();

    expect(tx.missionDeepLinkState.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: '77d8baef-d7de-48d7-975e-c7c0ea4c81bf',
        environment: scope.environment,
        userId: scope.actorUserId,
        keyVersion: 2,
        expiresAt,
        workspace: expect.objectContaining({
          memberships: { some: { userId: scope.actorUserId, status: 'ACTIVE' } },
        }),
      }),
    });
    expect(tx.missionDeepLinkState.updateMany).not.toHaveBeenCalled();
  });

  it('does not enqueue a retry for a manager outside the delivery service', async () => {
    const delivery = {
      id: 'delivery-a',
      environment: scope.environment,
      workspaceId: scope.workspaceId,
      groupId: 'group-a',
      bunshinId: scope.bunshinId,
      userId: 'recipient-a',
      attemptCount: 1,
    };
    const tx = {
      platformAdmin: { findFirst: vi.fn().mockResolvedValue(null) },
      lineMessageDelivery: { findFirst: vi.fn().mockResolvedValue(delivery) },
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      job: { create: vi.fn() },
      lineDeliveryRetryRequest: { create: vi.fn() },
    };
    const client = {
      $transaction: vi.fn((work: (value: typeof tx) => unknown) => Promise.resolve(work(tx))),
    } as unknown as PrismaClient;

    await expect(
      new PrismaLineDeliveryRetryRepository(client).request({
        requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        actorUserId: 'manager-b',
        environment: scope.environment,
        deliveryId: delivery.id,
        groupId: delivery.groupId,
        reason: 'provider recovery verification',
      }),
    ).resolves.toBeNull();

    expect(tx.groupMembership.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        groupId: delivery.groupId,
        userId: 'manager-b',
        status: 'ACTIVE',
        serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
        group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
      },
      select: { id: true },
    });
    expect(tx.job.create).not.toHaveBeenCalled();
    expect(tx.lineDeliveryRetryRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a retry when the requested service differs from the delivery snapshot', async () => {
    const tx = {
      platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: 'admin-a' }) },
      lineMessageDelivery: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'delivery-a',
          workspaceId: scope.workspaceId,
          groupId: 'group-a',
          bunshinId: scope.bunshinId,
          userId: 'recipient-a',
          attemptCount: 2,
        }),
      },
      groupMembership: { findFirst: vi.fn() },
      job: { create: vi.fn() },
      lineDeliveryRetryRequest: { create: vi.fn() },
    };
    const client = {
      $transaction: vi.fn((work: (value: typeof tx) => unknown) => Promise.resolve(work(tx))),
    } as unknown as PrismaClient;

    await expect(
      new PrismaLineDeliveryRetryRepository(client).request({
        requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        actorUserId: 'platform-admin',
        environment: scope.environment,
        deliveryId: 'delivery-a',
        groupId: 'group-b',
        reason: 'provider recovery verification',
      }),
    ).resolves.toBeNull();
    expect(tx.job.create).not.toHaveBeenCalled();
  });
});
