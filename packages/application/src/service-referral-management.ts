import type {
  ServiceReferralConfirmation,
  ServiceReferralReview,
} from './service-referral-confirmation';

export interface ReferralManagementScope {
  workspaceId: string;
  serviceId: string;
  actorUserId: string;
}
/** Opaque validated profile data. Capability adapters define the meaning of each key. */
export type ReferralQualificationConditions = Readonly<Record<string, boolean | number>>;
export interface ReferralPolicyView {
  id: string;
  version: number;
  authority: 'HEADQUARTERS' | 'SERVICE';
  status: 'ACTIVE' | 'SUSPENDED';
  timezone: string;
  conditions: ReferralQualificationConditions;
}
export type ReferralManagementCommand = {
  commandId: string;
  referralId: string;
  reason: string;
  expectedRevision: number;
} & (
  | { kind: 'REVIEW'; review: ServiceReferralReview }
  | { kind: 'CONFIRM'; expectedPolicyVersionId: string }
  | { kind: 'REVOKE' }
);
export interface ReferralManagementOverview {
  canSetHeadquartersPolicy: boolean;
  headquartersPolicy: ReferralPolicyView | null;
  policy: ReferralPolicyView | null;
  referrals: (ServiceReferralConfirmation & {
    referredMembershipId: string;
    referrerMembershipId: string;
  })[];
  hasMore: boolean;
}
/** Explicit privileged port; implementations must authorize each transaction. */
export interface ServiceReferralManagementRepository {
  overview(scope: ReferralManagementScope, after?: string): Promise<ReferralManagementOverview>;
  savePolicy(
    scope: ReferralManagementScope,
    input: {
      expectedPolicyVersionId: string | null;
      authority: 'HEADQUARTERS' | 'SERVICE';
      status: 'ACTIVE' | 'SUSPENDED';
      timezone: string;
      conditions: ReferralQualificationConditions;
      reason: string;
    },
  ): Promise<ReferralPolicyView>;
  execute(
    scope: ReferralManagementScope,
    command: ReferralManagementCommand,
  ): Promise<ServiceReferralConfirmation>;
}
