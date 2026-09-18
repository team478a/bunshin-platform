import { describe, expect, it, vi } from 'vitest';
import {
  ResaleItemService,
  type ResaleItemRecord,
  type ResaleItemRepository,
} from '../src/persistence';

const foundAt = new Date('2026-09-18T00:00:00.000Z');

function item(overrides: Partial<ResaleItemRecord> = {}): ResaleItemRecord {
  return {
    id: 'item-a',
    workspaceId: 'workspace-a',
    groupId: 'group-a',
    programEnrollmentId: 'enrollment-a',
    groupMembershipId: 'membership-a',
    ownerUserId: 'user-a',
    title: '未使用のバッグ',
    status: 'FOUND',
    reactionState: 'UNKNOWN',
    foundAt,
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
    createdAt: foundAt,
    updatedAt: foundAt,
    ...overrides,
  };
}

function repository() {
  return {
    create: vi.fn<ResaleItemRepository['create']>(),
    find: vi.fn<ResaleItemRepository['find']>(),
    list: vi.fn<ResaleItemRepository['list']>(),
    update: vi.fn<ResaleItemRepository['update']>(),
  } satisfies ResaleItemRepository;
}

const scope = {
  workspaceId: 'workspace-a',
  groupId: 'group-a',
  actorUserId: 'user-a',
  programEnrollmentId: 'enrollment-a',
};

describe('ResaleItemService', () => {
  it('normalizes a new item and preserves the enrollment scope', async () => {
    const repo = repository();
    repo.create.mockResolvedValue({ item: item(), created: true });
    const service = new ResaleItemService(repo);

    await service.create({
      ...scope,
      idempotencyKey: ' item-create-a ',
      title: ' 未使用のバッグ ',
      foundAt,
    });

    expect(repo.create).toHaveBeenCalledWith({
      ...scope,
      idempotencyKey: 'item-create-a',
      title: '未使用のバッグ',
      foundAt,
    });
  });

  it('rejects a backwards item transition before persistence', async () => {
    const repo = repository();
    repo.find.mockResolvedValue(
      item({ status: 'LISTED', listedAt: new Date('2026-09-18T01:00:00.000Z') }),
    );
    const service = new ResaleItemService(repo);

    await expect(
      service.update({
        ...scope,
        itemId: 'item-a',
        expectedRevision: 1,
        title: '未使用のバッグ',
        state: {
          status: 'PHOTOGRAPHED',
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
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('requires a listed item before scheduling reevaluation', async () => {
    const repo = repository();
    repo.find.mockResolvedValue(item());
    const service = new ResaleItemService(repo);

    await expect(
      service.update({
        ...scope,
        itemId: 'item-a',
        expectedRevision: 1,
        title: '未使用のバッグ',
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
          reevaluateAt: new Date('2026-09-19T00:00:00.000Z'),
          archivedAt: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('reports an optimistic concurrency conflict', async () => {
    const repo = repository();
    repo.find.mockResolvedValue(item());
    repo.update.mockResolvedValue(null);
    const service = new ResaleItemService(repo);

    await expect(
      service.update({
        ...scope,
        itemId: 'item-a',
        expectedRevision: 1,
        title: '未使用のバッグ',
        state: {
          status: 'PHOTOGRAPHED',
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
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('does not allow a recorded listing time to be rewritten', async () => {
    const repo = repository();
    repo.find.mockResolvedValue(
      item({ status: 'LISTED', listedAt: new Date('2026-09-18T01:00:00.000Z') }),
    );
    const service = new ResaleItemService(repo);

    await expect(
      service.update({
        ...scope,
        itemId: 'item-a',
        expectedRevision: 1,
        title: '未使用のバッグ',
        state: {
          status: 'LISTED',
          reactionState: 'NO_REACTION',
          listedAt: new Date('2026-09-18T02:00:00.000Z'),
          reactionObservedAt: new Date('2026-09-18T03:00:00.000Z'),
          lastImprovementType: null,
          lastImprovedAt: null,
          soldAt: null,
          soldPriceYen: null,
          shippedAt: null,
          reevaluateAt: null,
          archivedAt: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.update).not.toHaveBeenCalled();
  });
});
