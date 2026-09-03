import {
  normalizeServiceReferralRewardRule,
  type ServiceReferralRewardRuleInput,
} from './service-referral-credit';

export type ServiceReferralRewardRuleStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED';

export interface ServiceReferralRewardRuleRecord extends ServiceReferralRewardRuleInput {
  id: string;
  version: number;
  status: ServiceReferralRewardRuleStatus;
  createdAt: Date;
}

export interface ServiceReferralRewardRuleRepository {
  listCurrent(input: {
    workspaceId: string;
    groupId: string;
  }): Promise<ServiceReferralRewardRuleRecord[]>;
  saveVersion(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    status: ServiceReferralRewardRuleStatus;
    rule: ServiceReferralRewardRuleInput;
    now: Date;
  }): Promise<ServiceReferralRewardRuleRecord>;
}

export class ServiceReferralRewardRuleService {
  constructor(
    private readonly repository: ServiceReferralRewardRuleRepository,
    private readonly now = () => new Date(),
  ) {}

  listCurrent(input: { workspaceId: string; groupId: string }) {
    return this.repository.listCurrent(input);
  }

  save(
    input: Omit<
      Parameters<ServiceReferralRewardRuleRepository['saveVersion']>[0],
      'now' | 'rule'
    > & {
      rule: ServiceReferralRewardRuleInput;
    },
  ) {
    return this.repository.saveVersion({
      ...input,
      rule: normalizeServiceReferralRewardRule(input.rule),
      now: this.now(),
    });
  }
}
