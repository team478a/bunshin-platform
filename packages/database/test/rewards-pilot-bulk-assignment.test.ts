import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  replaceRewardsPilotMemberAssignments,
  startFourWeekRewardsPilot,
} from '../src/rewards-pilot-access';

describe('startFourWeekRewardsPilot', () => {
  it('allows a service manager to start an audited 28-day pilot for their service', async () => {
    const now = new Date('2026-09-12T00:00:00.000Z');
    const endsAt = new Date('2026-10-10T00:00:00.000Z');
    const upsert = vi.fn().mockResolvedValue({ status: 'ENABLED', startsAt: now, endsAt });
    const audit = vi.fn().mockResolvedValue({});
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'manager-1' }) },
      featureDefinition: { findFirst: vi.fn().mockResolvedValue({ key: 'REWARDS.POINTS_BADGES' }) },
      groupFeaturePolicy: { findFirst: vi.fn().mockResolvedValue(null), upsert },
      groupFeatureAuditLog: { create: audit },
    } as unknown as Pick<
      Prisma.TransactionClient,
      'groupMembership' | 'featureDefinition' | 'groupFeaturePolicy' | 'groupFeatureAuditLog'
    >;

    await startFourWeekRewardsPilot(client, {
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      actorUserId: 'operator-1',
      reason: 'free pilot period',
      now,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'ENABLED', startsAt: now, endsAt }),
        update: expect.objectContaining({ status: 'ENABLED', startsAt: now, endsAt }),
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'GROUP_POLICY_SET',
          performedByUserId: 'operator-1',
        }),
      }),
    );
  });

  it('rejects callers who do not manage the service', async () => {
    const upsert = vi.fn();
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      featureDefinition: { findFirst: vi.fn().mockResolvedValue({ key: 'REWARDS.POINTS_BADGES' }) },
      groupFeaturePolicy: { findFirst: vi.fn().mockResolvedValue(null), upsert },
      groupFeatureAuditLog: { create: vi.fn() },
    } as unknown as Pick<
      Prisma.TransactionClient,
      'groupMembership' | 'featureDefinition' | 'groupFeaturePolicy' | 'groupFeatureAuditLog'
    >;

    await expect(
      startFourWeekRewardsPilot(client, {
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'member-1',
        reason: 'free pilot period',
        now: new Date('2026-09-12T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(upsert).not.toHaveBeenCalled();
  });
});

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
    const findFirst = vi.fn();
    const client = {
      groupMembership: { findFirst, findMany: vi.fn() },
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
    expect(findFirst).not.toHaveBeenCalled();
  });
});
