import { describe, expect, it, vi } from 'vitest';
import { ProgramRuntimeService, type ProgramRuntimeRepository } from '../src/program-runtime';

const makeRepository = () => {
  const mocks = {
    createAssignment: vi.fn<ProgramRuntimeRepository['createAssignment']>(),
    transitionAssignment: vi.fn<ProgramRuntimeRepository['transitionAssignment']>(),
    appendEvent: vi.fn<ProgramRuntimeRepository['appendEvent']>(),
    saveProgress: vi.fn<ProgramRuntimeRepository['saveProgress']>(),
    findProgress: vi.fn<ProgramRuntimeRepository['findProgress']>(),
  };
  return { repository: mocks satisfies ProgramRuntimeRepository, mocks };
};

describe('ProgramRuntimeService', () => {
  it('rejects an assignment with an incomplete target pair', async () => {
    const { repository, mocks } = makeRepository();
    const service = new ProgramRuntimeService(repository);
    await expect(
      service.createAssignment({
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        actorUserId: 'user-a',
        programEnrollmentId: 'enrollment-a',
        programTemplateVersionId: 'version-a',
        sequence: 1,
        routeKey: 'STANDARD',
        phaseKey: 'FOUNDATION',
        missionDefinitionKey: 'FOUNDATION_POST_1',
        variantKey: null,
        targetResourceType: 'DAILY_MISSION',
        targetResourceId: null,
        displaySnapshot: {},
        ruleVersion: 'program-v1',
        presentedAt: new Date(),
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.createAssignment).not.toHaveBeenCalled();
  });

  it('rejects unsupported event schemas before persistence', async () => {
    const { repository, mocks } = makeRepository();
    const service = new ProgramRuntimeService(repository);
    await expect(
      service.appendEvent({
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        actorUserId: 'user-a',
        programEnrollmentId: 'enrollment-a',
        missionAssignmentId: null,
        eventType: 'MISSION_COMPLETED',
        sourceResourceType: null,
        sourceResourceId: null,
        idempotencyKey: 'event-a',
        schemaVersion: 2,
        metadata: {},
        occurredAt: new Date(),
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.appendEvent).not.toHaveBeenCalled();
  });

  it('rejects an empty transition idempotency key', async () => {
    const { repository, mocks } = makeRepository();
    const service = new ProgramRuntimeService(repository);
    await expect(
      service.transitionAssignment({
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        actorUserId: 'user-a',
        programEnrollmentId: 'enrollment-a',
        assignmentId: 'assignment-a',
        transition: 'COMPLETE',
        idempotencyKey: ' ',
        metadata: {},
        occurredAt: new Date(),
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.transitionAssignment).not.toHaveBeenCalled();
  });

  it('normalizes keys and preserves tenant scope for progress', async () => {
    const { repository, mocks } = makeRepository();
    const service = new ProgramRuntimeService(repository);
    mocks.saveProgress.mockResolvedValue({
      id: 'progress-a',
      workspaceId: 'workspace-a',
      groupId: 'group-a',
      programEnrollmentId: 'enrollment-a',
      programTemplateVersionId: 'version-a',
      currentAssignmentId: null,
      routeKey: 'STANDARD',
      phaseKey: 'FOUNDATION',
      stateKey: 'ACTIVE',
      bottleneckKey: null,
      completedMissionCount: 0,
      revision: 1,
      ruleVersion: 'program-v1',
      lastActionAt: null,
      calculatedAt: new Date(),
    });
    await service.saveProgress({
      workspaceId: 'workspace-a',
      groupId: 'group-a',
      actorUserId: 'user-a',
      programEnrollmentId: 'enrollment-a',
      programTemplateVersionId: 'version-a',
      currentAssignmentId: null,
      routeKey: ' STANDARD ',
      phaseKey: ' FOUNDATION ',
      stateKey: ' ACTIVE ',
      bottleneckKey: null,
      completedMissionCount: 0,
      ruleVersion: ' program-v1 ',
      lastActionAt: null,
      calculatedAt: new Date(),
    });
    expect(mocks.saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        routeKey: 'STANDARD',
        phaseKey: 'FOUNDATION',
        stateKey: 'ACTIVE',
        ruleVersion: 'program-v1',
      }),
    );
  });
});
