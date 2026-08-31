import { describe, expect, it, vi } from 'vitest';
import { ProgramGoalsService, type ProgramGoalsRepository } from '../src/program-goals-core';

const repository = () => {
  const mocks = {
    setSupportPolicy: vi.fn<ProgramGoalsRepository['setSupportPolicy']>(),
    saveMemberPreference: vi.fn<ProgramGoalsRepository['saveMemberPreference']>(),
    createGoalDefinition: vi.fn<ProgramGoalsRepository['createGoalDefinition']>(),
    setMemberGoal: vi.fn<ProgramGoalsRepository['setMemberGoal']>(),
  };
  return { repo: mocks satisfies ProgramGoalsRepository, mocks };
};

describe('ProgramGoalsService', () => {
  it('requires the default support mode to be allowed', async () => {
    const { repo, mocks } = repository();
    await expect(
      new ProgramGoalsService(repo).setSupportPolicy({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'manager-a',
        serviceProgramId: 'program-a',
        allowedSupportModes: ['GUIDED'],
        defaultSupportMode: 'READY_TO_USE',
        memberMayChoose: true,
        guidance: '選べます',
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.setSupportPolicy).not.toHaveBeenCalled();
  });

  it('passes every service boundary key when saving a preference', async () => {
    const { repo, mocks } = repository();
    mocks.saveMemberPreference.mockResolvedValue({ id: 'preference-a' });
    await new ProgramGoalsService(repo).saveMemberPreference({
      workspaceId: 'workspace-a',
      groupId: 'service-a',
      actorUserId: 'user-a',
      programEnrollmentId: 'enrollment-a',
      preferredSupportMode: 'GUIDED',
      notes: '  作り方も知りたい  ',
    });
    expect(mocks.saveMemberPreference).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      groupId: 'service-a',
      actorUserId: 'user-a',
      programEnrollmentId: 'enrollment-a',
      preferredSupportMode: 'GUIDED',
      notes: '作り方も知りたい',
    });
  });

  it('rejects non-positive or reversed member goals', async () => {
    const { repo, mocks } = repository();
    const startsAt = new Date('2026-09-01T00:00:00Z');
    await expect(
      new ProgramGoalsService(repo).setMemberGoal({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'user-a',
        programEnrollmentId: 'enrollment-a',
        goalDefinitionId: null,
        title: '投稿を続ける',
        metricType: 'ACTION',
        targetValue: 0,
        unit: '投稿',
        startsAt,
        dueAt: startsAt,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.setMemberGoal).not.toHaveBeenCalled();
  });
});
