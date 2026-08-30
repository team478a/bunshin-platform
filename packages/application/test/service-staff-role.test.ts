import { describe, expect, it } from 'vitest';
import {
  ServiceStaffRoleService,
  type ServiceStaffRoleRecord,
  type ServiceStaffRoleRepository,
} from '../src/service-staff-role';

const record: ServiceStaffRoleRecord = {
  membershipId: 'membership-1',
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  userId: 'user-1',
  serviceRole: 'SERVICE_ADMIN',
  status: 'ACTIVE',
};

class Repository implements ServiceStaffRoleRepository {
  setInput: Parameters<ServiceStaffRoleRepository['set']>[0] | null = null;
  constructor(private readonly allowed = true) {}
  list() {
    return Promise.resolve(this.allowed ? [record] : null);
  }
  set(input: Parameters<ServiceStaffRoleRepository['set']>[0]) {
    this.setInput = input;
    return Promise.resolve(this.allowed ? { ...record, serviceRole: input.serviceRole } : null);
  }
}

describe('service staff roles', () => {
  it('lists roles only when the repository authorizes the actor', async () => {
    await expect(
      new ServiceStaffRoleService(new Repository()).list({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'owner-1',
      }),
    ).resolves.toEqual([record]);
    await expect(
      new ServiceStaffRoleService(new Repository(false)).list({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'admin-1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('normalizes the mandatory audit reason', async () => {
    const repository = new Repository();
    await new ServiceStaffRoleService(repository).set({
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      membershipId: 'membership-1',
      serviceRole: 'CONTENT_EDITOR',
      actorUserId: 'owner-1',
      reason: '  コンテンツ担当へ変更するため  ',
      now: new Date('2026-08-31T00:00:00Z'),
    });
    expect(repository.setInput?.reason).toBe('コンテンツ担当へ変更するため');
  });

  it('rejects a short reason before persistence', async () => {
    const repository = new Repository();
    await expect(
      new ServiceStaffRoleService(repository).set({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        membershipId: 'membership-1',
        serviceRole: 'PARTICIPANT',
        actorUserId: 'owner-1',
        reason: '短い',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.setInput).toBeNull();
  });
});
