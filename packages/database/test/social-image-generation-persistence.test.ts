import { describe, expect, it, vi } from 'vitest';
import { PrismaSocialImageGenerationRequestRepository } from '../src';

const ids = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  groupMembershipId: '00000000-0000-4000-8000-000000000003',
  actorUserId: '00000000-0000-4000-8000-000000000004',
  bunshinId: '00000000-0000-4000-8000-000000000005',
  dailyMissionId: '00000000-0000-4000-8000-000000000006',
  pilotEnrollmentId: '00000000-0000-4000-8000-000000000007',
  requestId: '00000000-0000-4000-8000-000000000008',
};

const input = {
  ...ids,
  campaignId: null,
  productPackVersionId: null,
  generationContextSnapshotId: null,
  layout: {
    templateKey: 'THREE_POINTS' as const,
    headline: '今日の3つのポイント',
    bodyLines: ['ひとつ目', 'ふたつ目', 'みっつ目'],
    cta: '保存して試してください',
    accentColor: '#FF3B30',
  },
  idempotencyKey: 'image-request-once',
};

const row = {
  id: ids.requestId,
  workspaceId: ids.workspaceId,
  groupId: ids.groupId,
  groupMembershipId: ids.groupMembershipId,
  ownerUserId: ids.actorUserId,
  bunshinId: ids.bunshinId,
  dailyMissionId: ids.dailyMissionId,
  campaignId: null,
  productPackVersionId: null,
  generationContextSnapshotId: null,
  pilotEnrollmentId: ids.pilotEnrollmentId,
  status: 'DRAFT' as const,
  templateKey: input.layout.templateKey,
  layout: input.layout,
  idempotencyKey: input.idempotencyKey,
  revision: 1,
  errorCode: null,
  createdAt: new Date('2026-08-28T00:00:00Z'),
  updatedAt: new Date('2026-08-28T00:00:00Z'),
};

const transactionClient = (overrides: Record<string, unknown> = {}) => ({
  groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: ids.groupMembershipId }) },
  socialImagePilotEnrollment: {
    findFirst: vi.fn().mockResolvedValue({ id: ids.pilotEnrollmentId }),
  },
  bunshin: { findFirst: vi.fn().mockResolvedValue({ id: ids.bunshinId }) },
  dailyMission: { findFirst: vi.fn().mockResolvedValue({ id: ids.dailyMissionId }) },
  campaign: { findFirst: vi.fn() },
  productPackVersion: { findFirst: vi.fn() },
  generationContextSnapshot: { findFirst: vi.fn() },
  socialImageGenerationRequest: {
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ ...row, status: 'QUEUED', revision: 2 }),
    findFirst: vi.fn().mockResolvedValue(row),
    create: vi.fn().mockResolvedValue(row),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  ...overrides,
});

const repository = (tx: ReturnType<typeof transactionClient>) =>
  new PrismaSocialImageGenerationRequestRepository({
    $transaction: vi.fn((callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    socialImageGenerationRequest: tx.socialImageGenerationRequest,
  } as never);

describe('PrismaSocialImageGenerationRequestRepository', () => {
  it('fails closed before persistence when the exact active member scope is unavailable', async () => {
    const tx = transactionClient({
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    await expect(repository(tx).create(input)).resolves.toBeNull();
    expect(tx.groupMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: ids.workspaceId,
          groupId: ids.groupId,
          id: ids.groupMembershipId,
          userId: ids.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
        }),
      }),
    );
    expect(tx.socialImageGenerationRequest.create).not.toHaveBeenCalled();
  });

  it('requires both group and participant feature grants plus an active pilot enrollment', async () => {
    const tx = transactionClient();
    await expect(repository(tx).create(input)).resolves.toMatchObject({ id: ids.requestId });
    const membershipWhere = tx.groupMembership.findFirst.mock.calls[0]?.[0]?.where;
    expect(membershipWhere.group.featurePolicies.some.featureKey).toBe('SOCIAL.IMAGE_GENERATION');
    expect(membershipWhere.featureAssignments.some.featureKey).toBe('SOCIAL.IMAGE_GENERATION');
    expect(tx.socialImagePilotEnrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: ids.workspaceId,
          groupId: ids.groupId,
          groupMembershipId: ids.groupMembershipId,
          status: 'ACTIVE',
          revokedAt: null,
          pilot: expect.objectContaining({ status: 'ACTIVE', emergencyStop: false }),
        }),
      }),
    );
  });

  it('returns the existing record for the same owner idempotency key', async () => {
    const tx = transactionClient();
    tx.socialImageGenerationRequest.findUnique.mockResolvedValue(row);
    await expect(repository(tx).create(input)).resolves.toMatchObject({ id: ids.requestId });
    expect(tx.groupMembership.findFirst).toHaveBeenCalled();
    expect(tx.socialImageGenerationRequest.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_groupId_ownerUserId_idempotencyKey: {
          workspaceId: ids.workspaceId,
          groupId: ids.groupId,
          ownerUserId: ids.actorUserId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    expect(tx.socialImageGenerationRequest.create).not.toHaveBeenCalled();
  });

  it('scopes reads by workspace, group, owner and current entitlement', async () => {
    const tx = transactionClient();
    await expect(
      repository(tx).findOwned({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        actorUserId: ids.actorUserId,
        requestId: ids.requestId,
      }),
    ).resolves.toMatchObject({ id: ids.requestId });
    expect(tx.socialImageGenerationRequest.findFirst).toHaveBeenCalledWith({
      where: {
        id: ids.requestId,
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        ownerUserId: ids.actorUserId,
      },
    });
  });

  it('updates one matching revision and never performs an unscoped transition', async () => {
    const tx = transactionClient();
    await expect(
      repository(tx).transition({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        actorUserId: ids.actorUserId,
        requestId: ids.requestId,
        expectedRevision: 1,
        fromStatus: 'DRAFT',
        toStatus: 'QUEUED',
        errorCode: null,
      }),
    ).resolves.toMatchObject({ status: 'QUEUED', revision: 2 });
    expect(tx.socialImageGenerationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: ids.requestId,
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        ownerUserId: ids.actorUserId,
        revision: 1,
        status: 'DRAFT',
      },
      data: { status: 'QUEUED', errorCode: null, revision: { increment: 1 } },
    });
  });
});
