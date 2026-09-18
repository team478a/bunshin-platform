import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaCommercialUsageService } from '../src/commercial-usage';

function clientWithMembership(membership: unknown) {
  const groupMembershipFindFirst = vi.fn().mockResolvedValue(membership);
  const serviceUsageEventCreate = vi.fn().mockResolvedValue({ id: 'event-1' });
  const groupMembershipUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const client = {
    groupMembership: {
      findFirst: groupMembershipFindFirst,
      updateMany: groupMembershipUpdateMany,
    },
    serviceUsageEvent: { create: serviceUsageEventCreate },
    $transaction: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaClient;
  return { client, groupMembershipFindFirst, serviceUsageEventCreate };
}

const input = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  userId: '00000000-0000-4000-8000-000000000003',
  eventType: 'DAILY_MISSION_VIEW' as const,
  source: 'test',
  idempotencyKey: 'view:1',
};

describe('PrismaCommercialUsageService', () => {
  it('records a tenant-scoped event for an active participant', async () => {
    const { client, serviceUsageEventCreate } = clientWithMembership({
      id: '00000000-0000-4000-8000-000000000004',
      user: { platformAdmin: null, memberships: [] },
    });

    await expect(new PrismaCommercialUsageService(client).record(input)).resolves.toBe('RECORDED');
    expect(serviceUsageEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.userId,
        eventType: input.eventType,
      }),
    });
  });

  it('does not bill a workspace operator even when the user also has a participant membership', async () => {
    const { client, serviceUsageEventCreate } = clientWithMembership({
      id: '00000000-0000-4000-8000-000000000004',
      user: { platformAdmin: null, memberships: [{ id: 'operator-membership' }] },
    });

    await expect(new PrismaCommercialUsageService(client).record(input)).resolves.toBe(
      'NOT_BILLABLE',
    );
    expect(serviceUsageEventCreate).not.toHaveBeenCalled();
  });

  it('does not accept a membership outside the requested workspace and group', async () => {
    const { client, groupMembershipFindFirst, serviceUsageEventCreate } =
      clientWithMembership(null);
    await new PrismaCommercialUsageService(client).record(input);

    expect(groupMembershipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.userId,
        }),
      }),
    );
    expect(serviceUsageEventCreate).not.toHaveBeenCalled();
  });
});
