import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaLineOperationalSnapshotRepository } from '../src';

const now = new Date('2026-09-26T03:30:00.000Z');

describe('LINE operational snapshot repository', () => {
  it('detects service broadcast incidents only from the requested environment', async () => {
    const jobFindMany = vi.fn().mockResolvedValue([
      {
        id: 'job-stalled',
        payloadReference: 'service-line-broadcast:broadcast-stalled',
        idempotencyKey: 'service-line-broadcast:broadcast-stalled',
        status: 'RETRY_SCHEDULED',
        updatedAt: now,
      },
      {
        id: 'job-dead',
        payloadReference: 'service-line-broadcast:broadcast-failed',
        idempotencyKey: 'service-line-broadcast-recovery:broadcast-failed:v1',
        status: 'DEAD',
        updatedAt: now,
      },
      {
        id: 'job-recovered',
        payloadReference: 'service-line-broadcast:broadcast-recovered',
        idempotencyKey: 'service-line-broadcast-recovery:broadcast-recovered:v1',
        status: 'SUCCEEDED',
        updatedAt: now,
      },
    ]);
    const broadcastFindMany = vi.fn().mockResolvedValue([
      {
        id: 'broadcast-stalled',
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        status: 'SCHEDULED',
        scheduledAt: new Date('2026-09-26T03:00:00.000Z'),
        completedAt: null,
        updatedByUserId: 'manager-a',
        audits: [],
      },
      {
        id: 'broadcast-failed',
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        status: 'COMPLETED',
        scheduledAt: new Date('2026-09-26T02:00:00.000Z'),
        completedAt: new Date('2026-09-26T02:05:00.000Z'),
        updatedByUserId: 'manager-a',
        audits: [],
      },
      {
        id: 'broadcast-recovered',
        workspaceId: 'workspace-b',
        groupId: 'group-b',
        status: 'COMPLETED',
        scheduledAt: new Date('2026-09-26T02:00:00.000Z'),
        completedAt: new Date('2026-09-26T02:10:00.000Z'),
        updatedByUserId: 'manager-b',
        audits: [],
      },
    ]);
    const client = {
      lineMessageDelivery: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      job: {
        count: vi.fn().mockResolvedValue(0),
        findMany: jobFindMany,
      },
      lineChannelConfiguration: {
        findFirst: vi.fn().mockResolvedValue({
          lastVerifiedAt: now,
          lastErrorCategory: null,
          globallyPaused: false,
        }),
      },
      serviceLineBroadcast: { findMany: broadcastFindMany },
      serviceLineBroadcastRecipient: {
        groupBy: vi.fn().mockResolvedValue([
          { broadcastId: 'broadcast-stalled', status: 'PENDING', _count: { _all: 10 } },
          { broadcastId: 'broadcast-failed', status: 'SENT', _count: { _all: 1 } },
          { broadcastId: 'broadcast-failed', status: 'FAILED', _count: { _all: 3 } },
          { broadcastId: 'broadcast-recovered', status: 'SENT', _count: { _all: 8 } },
        ]),
      },
    } as unknown as PrismaClient;

    const result = await new PrismaLineOperationalSnapshotRepository(client).get('PRODUCTION', now);

    expect(jobFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ environment: 'PRODUCTION' }) }),
    );
    expect(broadcastFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: ['broadcast-stalled', 'broadcast-failed', 'broadcast-recovered'],
          },
        }),
      }),
    );
    expect(result.serviceBroadcastEvents?.map(({ code }) => code)).toEqual([
      'SERVICE_BROADCAST_STALLED',
      'SERVICE_BROADCAST_HIGH_FAILURE',
      'SERVICE_BROADCAST_RECOVERY_EXHAUSTED',
      'SERVICE_BROADCAST_RECOVERED',
    ]);
  });

  it('records aggregate notification delivery against each affected broadcast', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      serviceLineBroadcastAuditLog: { createMany },
    } as unknown as PrismaClient;
    const repository = new PrismaLineOperationalSnapshotRepository(client);

    await repository.recordServiceBroadcastAlerts(
      [
        {
          code: 'SERVICE_BROADCAST_STALLED',
          eventKey: 'SERVICE_BROADCAST_STALLED:broadcast-a:2026-09-26T03:00:00.000Z',
          workspaceId: 'workspace-a',
          groupId: 'group-a',
          broadcastId: 'broadcast-a',
          performedByUserId: 'manager-a',
        },
      ],
      'fingerprint-a',
      now,
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          workspaceId: 'workspace-a',
          groupId: 'group-a',
          broadcastId: 'broadcast-a',
          action: 'OPERATION_ALERT_SENT',
          performedByUserId: 'manager-a',
          afterData: expect.objectContaining({ fingerprint: 'fingerprint-a' }),
        }),
      ],
    });
  });
});
