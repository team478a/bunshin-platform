import { ApplicationError } from '@bunshin/shared';
import type { ServiceReferralMilestone } from './service-referral-credit';

export interface ServiceReferralRewardGrant {
  ruleId: string;
  beneficiaryMembershipId: string;
  creditAmount: number;
}

export interface ServiceReferralRewardRepository {
  completeMilestone(input: {
    workspaceId: string;
    groupId: string;
    referredUserId: string;
    milestone: Exclude<ServiceReferralMilestone, 'QUALIFICATION_CONFIRMED'>;
    now: Date;
  }): Promise<ServiceReferralRewardGrant[]>;
}

export class ServiceReferralRewardService {
  constructor(
    private readonly repository: ServiceReferralRewardRepository,
    private readonly now = () => new Date(),
  ) {}

  async completeMilestone(
    input: Omit<Parameters<ServiceReferralRewardRepository['completeMilestone']>[0], 'now'>,
  ) {
    if (input.milestone !== 'ONBOARDING_COMPLETED' && input.milestone !== 'FIRST_POST_REPORTED')
      throw new ApplicationError('VALIDATION_ERROR', 'invalid referral milestone');
    return this.repository.completeMilestone({ ...input, now: this.now() });
  }
}
