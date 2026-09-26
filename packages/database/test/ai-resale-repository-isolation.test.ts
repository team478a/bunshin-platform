import { describe, expect, it, vi } from 'vitest';
import { PrismaResaleItemRepository } from '../src';

const scope = {
  workspaceId: '00000000-0000-4000-8000-000000000201',
  groupId: '00000000-0000-4000-8000-000000000202',
  actorUserId: '00000000-0000-4000-8000-000000000203',
  programEnrollmentId: '00000000-0000-4000-8000-000000000204',
};

const enrollment = {
  id: scope.programEnrollmentId,
  groupMembershipId: '00000000-0000-4000-8000-000000000205',
};

const participant = {
  id: enrollment.groupMembershipId,
  serviceRole: 'PARTICIPANT',
};

const manager = {
  id: '00000000-0000-4000-8000-000000000206',
  serviceRole: 'SERVICE_ADMIN',
};

function itemRow() {
  const now = new Date('2026-09-26T00:00:00.000Z');
  return {
    id: '00000000-0000-4000-8000-000000000207',
    workspaceId: scope.workspaceId,
    groupId: scope.groupId,
    programEnrollmentId: scope.programEnrollmentId,
    groupMembershipId: enrollment.groupMembershipId,
    ownerUserId: scope.actorUserId,
    title: '未使用のバッグ',
    status: 'FOUND',
    reactionState: 'UNKNOWN',
    foundAt: now,
    listedAt: null,
    reactionObservedAt: null,
    lastImprovementType: null,
    lastImprovedAt: null,
    soldAt: null,
    soldPriceYen: null,
    shippedAt: null,
    reevaluateAt: null,
    archivedAt: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

describe('AI resale repository isolation', () => {
  it('does not read items when a participant requests another enrollment', async () => {
    const client = {
      programEnrollment: { findFirst: vi.fn().mockResolvedValue(enrollment) },
      groupMembership: {
        findFirst: vi.fn().mockResolvedValue({ ...participant, id: 'another-membership' }),
      },
      resaleItem: { findFirst: vi.fn() },
    };

    await expect(
      new PrismaResaleItemRepository(client as never).find({
        ...scope,
        itemId: '00000000-0000-4000-8000-000000000207',
      }),
    ).resolves.toBeNull();
    expect(client.resaleItem.findFirst).not.toHaveBeenCalled();
  });

  it('allows a service manager to read an item only within the requested scope', async () => {
    const item = itemRow();
    const client = {
      programEnrollment: { findFirst: vi.fn().mockResolvedValue(enrollment) },
      groupMembership: { findFirst: vi.fn().mockResolvedValue(manager) },
      resaleItem: { findFirst: vi.fn().mockResolvedValue(item) },
    };

    await expect(
      new PrismaResaleItemRepository(client as never).find({
        ...scope,
        itemId: item.id,
      }),
    ).resolves.toEqual(item);
    expect(client.resaleItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: item.id,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: enrollment.id,
      },
    });
  });

  it('does not create an item when the enrollment owner is absent from the scope', async () => {
    const tx = {
      programEnrollment: { findFirst: vi.fn().mockResolvedValue(enrollment) },
      groupMembership: {
        findFirst: vi.fn().mockResolvedValueOnce(manager).mockResolvedValueOnce(null),
      },
      resaleItem: { findUnique: vi.fn(), create: vi.fn() },
    };
    const client = {
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    await expect(
      new PrismaResaleItemRepository(client as never).create({
        ...scope,
        title: '未使用のバッグ',
        foundAt: new Date('2026-09-26T00:00:00.000Z'),
        idempotencyKey: 'resale-create-key',
      }),
    ).resolves.toBeNull();
    expect(tx.resaleItem.findUnique).not.toHaveBeenCalled();
    expect(tx.resaleItem.create).not.toHaveBeenCalled();
  });

  it('does not update an item when enrollment access is denied', async () => {
    const tx = {
      programEnrollment: { findFirst: vi.fn().mockResolvedValue(enrollment) },
      groupMembership: {
        findFirst: vi.fn().mockResolvedValue({ ...participant, id: 'another-membership' }),
      },
      resaleItem: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    };
    const client = {
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    await expect(
      new PrismaResaleItemRepository(client as never).update({
        ...scope,
        itemId: '00000000-0000-4000-8000-000000000207',
        title: '未使用のバッグ',
        expectedRevision: 1,
        state: {
          status: 'FOUND',
          reactionState: 'UNKNOWN',
          listedAt: null,
          reactionObservedAt: null,
          lastImprovementType: null,
          lastImprovedAt: null,
          soldAt: null,
          soldPriceYen: null,
          shippedAt: null,
          reevaluateAt: null,
          archivedAt: null,
        },
      }),
    ).resolves.toBeNull();
    expect(tx.resaleItem.updateMany).not.toHaveBeenCalled();
    expect(tx.resaleItem.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
