import { describe, expect, it, vi } from 'vitest';
import {
  ServiceReferralRewardRuleService,
  type ServiceReferralRewardRuleRepository,
} from '../src/service-referral-reward-rules';

const listCurrent = vi.fn(() => Promise.resolve([]));

const savedRule = (input: Parameters<ServiceReferralRewardRuleRepository['saveVersion']>[0]) =>
  Promise.resolve({
    id: 'rule-1',
    version: 1,
    status: input.status,
    ...input.rule,
    createdAt: input.now,
  });

describe('ServiceReferralRewardRuleService', () => {
  it('normalizes a rule before persisting a new version', async () => {
    const saveVersion = vi.fn(savedRule);
    await new ServiceReferralRewardRuleService(
      { listCurrent, saveVersion },
      () => new Date(0),
    ).save({
      workspaceId: 'workspace-1',
      groupId: 'service-1',
      actorUserId: 'user-1',
      status: 'ACTIVE',
      rule: {
        ruleKey: ' first-post-reported ',
        milestone: 'FIRST_POST_REPORTED',
        recipient: 'REFERRER',
        creditAmount: 2,
        expiresAfterDays: null,
        monthlyGrantLimit: 3,
      },
    });
    expect(saveVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        now: new Date(0),
        rule: expect.objectContaining({ ruleKey: 'first-post-reported' }),
      }),
    );
  });

  it('rejects an invalid credit amount before it reaches persistence', () => {
    const saveVersion = vi.fn(savedRule);
    expect(() =>
      new ServiceReferralRewardRuleService({ listCurrent, saveVersion }).save({
        workspaceId: 'workspace-1',
        groupId: 'service-1',
        actorUserId: 'user-1',
        status: 'ACTIVE',
        rule: {
          ruleKey: 'onboarding-completed',
          milestone: 'ONBOARDING_COMPLETED',
          recipient: 'REFERRED',
          creditAmount: 0,
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(saveVersion).not.toHaveBeenCalled();
  });
});
