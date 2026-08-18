import type { BunshinCapabilityAssignment } from '@bunshin/capability-contract';
import { describe, expect, it, vi } from 'vitest';
import type { BunshinCapabilityAssignmentRepository } from '../src';
import {
  ActivateBunshinCapability,
  RequireActiveBunshinCapability,
  SuspendBunshinCapability,
} from '../src';

const assignment = (status: BunshinCapabilityAssignment['status']) => ({
  id: 'assignment-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  capabilityType: 'SOCIAL' as const,
  status,
  config: {},
  assignedByUserId: 'user-1',
  activatedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('Capability Assignment use cases', () => {
  it('allows only ACTIVE assignment through the execution guard', async () => {
    for (const status of ['SUSPENDED', 'LOCKED'] as const) {
      const repository = {
        find: vi.fn().mockResolvedValue(assignment(status)),
      } as unknown as BunshinCapabilityAssignmentRepository;
      await expect(
        new RequireActiveBunshinCapability(repository).execute({
          workspaceId: 'workspace-1',
          actorUserId: 'user-1',
          bunshinId: 'bunshin-1',
          capabilityType: 'SOCIAL',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }

    const repository = {
      find: vi.fn().mockResolvedValue(assignment('ACTIVE')),
    } as unknown as BunshinCapabilityAssignmentRepository;
    await expect(
      new RequireActiveBunshinCapability(repository).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        bunshinId: 'bunshin-1',
        capabilityType: 'SOCIAL',
      }),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('treats an unassigned capability as not found', async () => {
    const repository = {
      find: vi.fn().mockResolvedValue(null),
    } as unknown as BunshinCapabilityAssignmentRepository;
    await expect(
      new RequireActiveBunshinCapability(repository).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        bunshinId: 'bunshin-1',
        capabilityType: 'SOCIAL',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('maps activate and suspend to the only user-manageable statuses', async () => {
    const setStatus = vi.fn().mockResolvedValue(assignment('ACTIVE'));
    const repository = { setStatus } as unknown as BunshinCapabilityAssignmentRepository;
    const input = {
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      bunshinId: 'bunshin-1',
      capabilityType: 'SOCIAL' as const,
    };
    await new ActivateBunshinCapability(repository).execute(input);
    await new SuspendBunshinCapability(repository).execute(input);
    expect(setStatus).toHaveBeenNthCalledWith(1, { ...input, status: 'ACTIVE' });
    expect(setStatus).toHaveBeenNthCalledWith(2, { ...input, status: 'SUSPENDED' });
  });
});
