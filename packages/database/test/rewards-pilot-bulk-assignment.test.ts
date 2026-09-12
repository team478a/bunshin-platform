import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { replaceRewardsPilotMemberAssignments } from '../src/rewards-pilot-access';

describe('replaceRewardsPilotMemberAssignments', () => {
  it('disables removed members before enabling the selected consented members', async () => {
    const startsAt = new Date('2026-09-12T00:00:00.000Z');
    const endsAt = new Date('2026-10-10T00:00:00.000Z');
    const update = vi.fn().mockResolvedValue({});
    const upsert = vi.fn().mockResolvedValue({});
    const audit = vi.fn().mockResolvedValue({});
    const client = {
      groupMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'manager-1' }),
        findMany: vi.fn().mockResolvedValue([{ id: 'member-new' }]),
      },
      groupFeaturePolicy: {
        findFirst: vi.fn().mockResolvedValue({ startsAt, endsAt }),
      },
      groupMemberFeatureAssignment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'assignment-old',
            groupMembershipId: 'member-old',
            status: 'ENABLED',
            startsAt,
            endsAt,
          },
        ]),
        update,
        upsert,
      },
      groupFeatureAuditLog: { create: audit },
    } as unknown as Pick<
      Prisma.TransactionClient,
      | 'groupMembership'
      | 'groupFeaturePolicy'
      | 'groupMemberFeatureAssignment'
      | 'groupFeatureAuditLog'
    >;

    await expect(
      replaceRewardsPilotMemberAssignments(client, {
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'operator-1',
        membershipIds: ['member-new'],
        reason: 'free pilot selection',
        now: startsAt,
      }),
    ).resolves.toEqual({ enabledCount: 1, disabledCount: 1 });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'assignment-old' },
      data: { status: 'DISABLED', assignedByUserId: 'operator-1' },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          groupMembershipId: 'member-new',
          status: 'ENABLED',
          startsAt,
          endsAt,
        }),
      }),
    );
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(upsert.mock.invocationCallOrder[0]!);
    expect(audit).toHaveBeenCalledTimes(2);
  });

  it('rejects a selected member who is not active and consented in the service', async () => {
    const now = new Date('2026-09-12T00:00:00.000Z');
    const client = {
      groupMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'manager-1' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      groupFeaturePolicy: {
        findFirst: vi.fn().mockResolvedValue({
          startsAt: now,
          endsAt: new Date('2026-10-10T00:00:00.000Z'),
        }),
      },
      groupMemberFeatureAssignment: { findMany: vi.fn().mockResolvedValue([]) },
      groupFeatureAuditLog: { create: vi.fn() },
    } as unknown as Pick<
      Prisma.TransactionClient,
      | 'groupMembership'
      | 'groupFeaturePolicy'
      | 'groupMemberFeatureAssignment'
      | 'groupFeatureAuditLog'
    >;

    await expect(
      replaceRewardsPilotMemberAssignments(client, {
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'operator-1',
        membershipIds: ['member-without-consent'],
        reason: 'free pilot selection',
        now,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects more than 30 selected members before querying the database', async () => {
    const client = {
      groupMembership: { findFirst: vi.fn(), findMany: vi.fn() },
      groupFeaturePolicy: { findFirst: vi.fn() },
      groupMemberFeatureAssignment: { findMany: vi.fn() },
      groupFeatureAuditLog: { create: vi.fn() },
    } as unknown as Pick<
      Prisma.TransactionClient,
      | 'groupMembership'
      | 'groupFeaturePolicy'
      | 'groupMemberFeatureAssignment'
      | 'groupFeatureAuditLog'
    >;

    await expect(
      replaceRewardsPilotMemberAssignments(client, {
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'operator-1',
        membershipIds: Array.from({ length: 31 }, (_, index) => `member-${index}`),
        reason: 'free pilot selection',
        now: new Date('2026-09-12T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(client.groupMembership.findFirst).not.toHaveBeenCalled();
  });
});
