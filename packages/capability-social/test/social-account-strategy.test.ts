import type { BunshinCapabilityAssignmentRepository } from '@bunshin/application';
import { describe, expect, it } from 'vitest';
import {
  ApproveSocialAccountStrategy,
  CreateSocialAccountStrategy,
  normalizeCreateSocialAccountStrategyInput,
  type SocialAccountStrategy,
  type SocialAccountStrategyRepository,
} from '../src';

const now = new Date('2026-08-20T00:00:00.000Z');
const input = {
  workspaceId: 'workspace-1',
  actorUserId: 'user-1',
  bunshinId: 'bunshin-1',
  socialProfileId: 'profile-1',
  platform: 'THREADS' as const,
  goal: 'FOLLOWERS' as const,
  availableMinutes: 5 as const,
  destinationType: 'PROFILE' as const,
  concept: ' 専門知識を毎日届ける ',
  positioning: ' 初心者の伴走者 ',
  targetSummary: ' 副業初心者 ',
  profileDraft: ' プロフィール ',
  ctaStrategy: ' フォロー ',
  postingPolicy: ' 毎日TEXT ',
};
class Assignments implements BunshinCapabilityAssignmentRepository {
  constructor(private readonly status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {}
  assign() {
    return Promise.resolve(null);
  }
  list() {
    return Promise.resolve([]);
  }
  setStatus() {
    return Promise.resolve(null);
  }
  find() {
    return Promise.resolve({
      id: 'a',
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      capabilityType: 'SOCIAL' as const,
      status: this.status,
      config: {},
      assignedByUserId: input.actorUserId,
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
}
class Strategies implements SocialAccountStrategyRepository {
  values: SocialAccountStrategy[] = [];
  createVersion(value: Parameters<SocialAccountStrategyRepository['createVersion']>[0]) {
    const created: SocialAccountStrategy = {
      ...value,
      destinationDetail: value.destinationDetail ?? null,
      version: this.values.length + 1,
      status: value.status ?? 'DRAFT',
      approvedAt: null,
      supersededAt: null,
      id: `s-${this.values.length + 1}`,
      createdAt: now,
      updatedAt: now,
    };
    this.values.push(created);
    return Promise.resolve(created);
  }
  list() {
    return Promise.resolve(this.values);
  }
  approve(value: Parameters<SocialAccountStrategyRepository['approve']>[0]) {
    const target = this.values.find((item) => item.id === value.strategyId) ?? null;
    if (target === null) return Promise.resolve(null);
    this.values = this.values.map((item) =>
      item.status === 'APPROVED' ? { ...item, status: 'SUPERSEDED', supersededAt: now } : item,
    );
    const approved = { ...target, status: 'APPROVED' as const, approvedAt: now };
    this.values = this.values.map((item) => (item.id === target.id ? approved : item));
    return Promise.resolve(approved);
  }
}
describe('SocialAccountStrategy', () => {
  it('normalizes fields and restricts available minutes', () => {
    expect(normalizeCreateSocialAccountStrategyInput(input)).toMatchObject({
      concept: '専門知識を毎日届ける',
      availableMinutes: 5,
    });
    expect(() =>
      normalizeCreateSocialAccountStrategyInput({ ...input, availableMinutes: 7 as 5 }),
    ).toThrow();
  });
  it('creates immutable versions and supersedes the previous approval', async () => {
    const repository = new Strategies();
    const assignments = new Assignments();
    const create = new CreateSocialAccountStrategy(repository, assignments);
    const first = await create.execute(input);
    const second = await create.execute({ ...input, concept: 'version 2' });
    const approve = new ApproveSocialAccountStrategy(repository, assignments);
    await approve.execute({ ...input, strategyId: first.id });
    await approve.execute({ ...input, strategyId: second.id });
    expect(repository.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, status: 'SUPERSEDED' }),
        expect.objectContaining({ id: second.id, status: 'APPROVED', version: 2 }),
      ]),
    );
  });
  it('blocks mutation while SOCIAL is suspended', async () => {
    await expect(
      new CreateSocialAccountStrategy(new Strategies(), new Assignments('SUSPENDED')).execute(
        input,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
