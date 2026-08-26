import { describe, expect, it, vi } from 'vitest';
import { GroupFeatureEntitlementService, type GroupFeatureEntitlementRepository } from '../src';

const now = new Date('2026-08-26T00:00:00Z');

const repository = () =>
  ({
    listDefinitions: vi.fn().mockResolvedValue([]),
    setGroupPolicy: vi.fn().mockImplementation((input) =>
      Promise.resolve({
        id: 'policy-1',
        ...input,
        createdAt: now,
        updatedAt: now,
        setByUserId: input.actorUserId,
      }),
    ),
    setMemberAssignment: vi.fn().mockImplementation((input) =>
      Promise.resolve({
        id: 'assignment-1',
        ...input,
        createdAt: now,
        updatedAt: now,
        assignedByUserId: input.actorUserId,
      }),
    ),
    resolveAccess: vi.fn().mockResolvedValue({
      allowed: true,
      reason: 'ALLOWED',
      dailyLimit: 3,
      monthlyLimit: 50,
    }),
  }) as unknown as GroupFeatureEntitlementRepository;

describe('GroupFeatureEntitlementService', () => {
  const scope = {
    workspaceId: 'workspace-1',
    groupId: 'group-1',
    actorUserId: 'user-1',
  };

  it('normalizes extensible feature keys without a feature enum', async () => {
    const value = repository();
    await new GroupFeatureEntitlementService(value).setGroupPolicy({
      ...scope,
      featureKey: ' blog.article_generation ',
      status: 'ENABLED',
      dailyLimit: 3,
      reason: 'テストグループへ許可',
    });
    // Repository methods are deliberately inspected as Vitest mocks here.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(value.setGroupPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ featureKey: 'BLOG.ARTICLE_GENERATION', dailyLimit: 3 }),
    );
  });

  it('rejects unsafe keys, limits, periods, and missing reasons', async () => {
    const service = new GroupFeatureEntitlementService(repository());
    const base = { ...scope, featureKey: 'BLOG', status: 'ENABLED' as const, reason: '許可' };
    await expect(
      service.setGroupPolicy({ ...base, featureKey: 'BLOG/ADMIN' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(service.setGroupPolicy({ ...base, dailyLimit: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      service.setGroupPolicy({ ...base, startsAt: now, endsAt: new Date(now.getTime() - 1) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.setGroupPolicy({ ...base, reason: ' ' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('uses the same effective access gateway for future features', async () => {
    const value = repository();
    await expect(
      new GroupFeatureEntitlementService(value).resolveAccess({
        ...scope,
        featureKey: 'SOCIAL.IMAGE_GENERATION',
        now,
      }),
    ).resolves.toEqual({
      allowed: true,
      reason: 'ALLOWED',
      dailyLimit: 3,
      monthlyLimit: 50,
    });
  });
});
