import { describe, expect, it, vi } from 'vitest';
import {
  ServiceReferralRewardService,
  type ServiceReferralRewardRepository,
} from '../src/service-referral-reward';

const repository = (): ServiceReferralRewardRepository => ({
  completeMilestone: vi.fn(() =>
    Promise.resolve([
      { ruleId: 'rule-1', beneficiaryMembershipId: 'membership-1', creditAmount: 3 },
    ]),
  ),
});

describe('ServiceReferralRewardService', () => {
  it('evaluates only a supported referral milestone', async () => {
    const completeMilestone = vi.fn(() => Promise.resolve([]));
    const service = new ServiceReferralRewardService({ ...repository(), completeMilestone });
    await service.completeMilestone({
      workspaceId: 'workspace-1',
      groupId: 'service-1',
      referredUserId: 'user-1',
      milestone: 'FIRST_POST_REPORTED',
    });
    expect(completeMilestone).toHaveBeenCalledWith(
      expect.objectContaining({ milestone: 'FIRST_POST_REPORTED', now: expect.any(Date) }),
    );
  });

  it('rejects an unsupported milestone before it reaches persistence', async () => {
    const completeMilestone = vi.fn(() => Promise.resolve([]));
    await expect(
      new ServiceReferralRewardService({ ...repository(), completeMilestone }).completeMilestone({
        workspaceId: 'workspace-1',
        groupId: 'service-1',
        referredUserId: 'user-1',
        milestone: 'REGISTERED' as never,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(completeMilestone).not.toHaveBeenCalled();
  });
});
