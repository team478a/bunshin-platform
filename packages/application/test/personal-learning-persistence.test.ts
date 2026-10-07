import { describe, expect, it, vi } from 'vitest';
import {
  PersonalLearningPersistenceService,
  type PersonalLearningPersistenceRepository,
  type PersonalLearningPlan,
} from '../src/index';

const scope = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  programEnrollmentId: '00000000-0000-4000-8000-000000000003',
  groupMembershipId: '00000000-0000-4000-8000-000000000004',
  userId: '00000000-0000-4000-8000-000000000005',
};
function fixture() {
  const repository = {
    confirmGoal: vi.fn().mockResolvedValue({ goalId: 'goal', planId: null, revision: null }),
    savePlan: vi.fn(),
    confirmPlan: vi.fn(),
    read: vi.fn().mockResolvedValue({ goals: [], plans: [] }),
  } satisfies PersonalLearningPersistenceRepository;
  return { repository, service: new PersonalLearningPersistenceService(repository) };
}
describe('personal learning persistence application boundary', () => {
  it('delegates only a valid actor and keeps authoritative checks in the repository', async () => {
    const { service, repository } = fixture();
    const actor = { scope, actorUserId: scope.userId };
    expect(await service.read(actor)).toEqual({ goals: [], plans: [] });
    expect(repository.read).toHaveBeenCalledWith(actor);
  });
  it('rejects a foreign actor without consulting storage', async () => {
    const { service, repository } = fixture();
    await expect(service.read({ scope, actorUserId: scope.workspaceId })).rejects.toThrow();
    expect(repository.read).not.toHaveBeenCalled();
  });
  it('rejects free-text operation keys without consulting storage', async () => {
    const { service, repository } = fixture();
    await expect(
      service.confirmPlan({
        scope,
        actorUserId: scope.userId,
        idempotencyKey: 'private consultation text',
        planId: scope.groupId,
        expectedRevision: 1,
      }),
    ).rejects.toThrow();
    expect(repository.confirmPlan).not.toHaveBeenCalled();
  });
  it('rejects malformed Plan input without consulting storage', async () => {
    const { service, repository } = fixture();
    await expect(
      service.savePlan({
        scope,
        actorUserId: scope.userId,
        idempotencyKey: 'plan',
        expectedRevision: 0,
        plan: { content: 'not a plan' } as unknown as PersonalLearningPlan,
      }),
    ).rejects.toThrow();
    expect(repository.savePlan).not.toHaveBeenCalled();
  });
});
