import { describe, expect, it } from 'vitest';
import { GroupParticipationService, type GroupParticipationRepository } from '../src';

const now = new Date('2026-08-25T00:00:00Z');

class Repository implements GroupParticipationRepository {
  createGroup(input: Parameters<GroupParticipationRepository['createGroup']>[0]) {
    return Promise.resolve({
      id: 'group-1',
      workspaceId: input.workspaceId,
      name: input.name,
      status: 'ACTIVE' as const,
      createdAt: now,
      updatedAt: now,
    });
  }
  createInvitation(input: Parameters<GroupParticipationRepository['createInvitation']>[0]) {
    return Promise.resolve({
      id: 'invitation-1',
      ...input,
      status: 'ACTIVE' as const,
      usedCount: 0,
      createdByUserId: input.actorUserId,
      source: 'MANUAL' as const,
      sourceEventId: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  createLineFollowInvitation(
    input: Parameters<GroupParticipationRepository['createLineFollowInvitation']>[0],
  ) {
    return Promise.resolve({
      id: 'follow-invitation-1',
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      tokenHash: input.tokenHash,
      role: 'PARTICIPANT' as const,
      status: 'ACTIVE' as const,
      expiresAt: input.expiresAt,
      maxUses: 1,
      usedCount: 0,
      createdByUserId: null,
      source: 'LINE_FOLLOW' as const,
      sourceEventId: input.sourceEventId,
      createdAt: now,
      updatedAt: now,
    });
  }
  acceptInvitation(input: Parameters<GroupParticipationRepository['acceptInvitation']>[0]) {
    return Promise.resolve({
      id: 'membership-1',
      workspaceId: input.workspaceId,
      groupId: 'group-1',
      userId: input.actorUserId,
      role: 'PARTICIPANT' as const,
      status: 'ACTIVE' as const,
      consentedAt: input.now,
      declinedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  declineInvitation() {
    return Promise.resolve(null);
  }
  leaveGroup() {
    return Promise.resolve(null);
  }
  listMemberships() {
    return Promise.resolve([]);
  }
  updateMembership(input: Parameters<GroupParticipationRepository['updateMembership']>[0]) {
    return Promise.resolve({
      id: input.groupMembershipId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      userId: 'user-2',
      role: input.role,
      status: input.status,
      consentedAt: now,
      declinedAt: null,
      revokedAt: input.status === 'REVOKED' ? input.now : null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

describe('GroupParticipationService', () => {
  const scope = { workspaceId: 'workspace-1', actorUserId: 'user-1' };

  it('normalizes a Group name and records explicit consent on accept', async () => {
    const service = new GroupParticipationService(new Repository());
    await expect(service.createGroup({ ...scope, name: '  営業チーム  ' })).resolves.toMatchObject({
      name: '営業チーム',
    });
    await expect(
      service.acceptInvitation({ ...scope, tokenHash: 'a'.repeat(64), now }),
    ).resolves.toMatchObject({ status: 'ACTIVE', consentedAt: now });
  });

  it('rejects unsafe invitation inputs before persistence', async () => {
    const service = new GroupParticipationService(new Repository());
    await expect(
      service.createInvitation({
        ...scope,
        groupId: 'group-1',
        tokenHash: 'plain-token',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.createGroup({ ...scope, name: ' ' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('creates a one-use participant invitation for an idempotent LINE follow event', async () => {
    const service = new GroupParticipationService(new Repository());
    await expect(
      service.createLineFollowInvitation({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        tokenHash: 'b'.repeat(64),
        sourceEventId: 'line-event-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    ).resolves.toMatchObject({ source: 'LINE_FOLLOW', maxUses: 1, role: 'PARTICIPANT' });
    await expect(
      service.createLineFollowInvitation({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        tokenHash: 'invalid',
        sourceEventId: 'line-event-2',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires a meaningful reason for membership changes', async () => {
    const service = new GroupParticipationService(new Repository());
    await expect(
      service.updateMembership({
        ...scope,
        groupId: 'group-1',
        groupMembershipId: 'membership-1',
        role: 'PARTICIPANT',
        status: 'SUSPENDED',
        reason: '短い',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
