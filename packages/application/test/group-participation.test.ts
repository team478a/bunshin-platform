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
});
