import { ApplicationError } from '@bunshin/shared';
import {
  SERVICE_REFERRAL_MILESTONES,
  type ServiceReferralMilestone,
} from './service-referral-credit';

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
    milestone: ServiceReferralMilestone;
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
    if (!SERVICE_REFERRAL_MILESTONES.includes(input.milestone))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid referral milestone');
    return this.repository.completeMilestone({ ...input, now: this.now() });
  }
}
