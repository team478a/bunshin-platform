import {
  projectMemberUsageEvidence,
  type MemberUsageRequest,
  type MemberUsageSources,
} from '@bunshin/application';
import type { SocialServiceReferralQualificationEvidence } from './service-referral-qualification';

/** Referred owner only. Never accept an administrator or referrer as a substitute actor. */
export type SocialServiceReferralEvidenceRequest = Omit<MemberUsageRequest, 'scope'> & {
  scope: Omit<MemberUsageRequest['scope'], 'bunshinId'>;
};
export interface SocialServiceReferralEvidenceRepository {
  read(
    input: SocialServiceReferralEvidenceRequest,
  ): Promise<SocialServiceReferralQualificationEvidence | null>;
}

/** SOCIAL binding only. Common referral membership gates never interpret these event kinds. */
export function projectSocialServiceReferralActivities(
  request: MemberUsageRequest,
  sources: MemberUsageSources,
) {
  const source = projectMemberUsageEvidence(request, sources);
  type Activity = SocialServiceReferralQualificationEvidence['activities'][number];
  const entries = (
    rows: readonly { id: string; scope: Activity['scope']; occurredAt: Date }[],
    kind: Activity['kind'],
  ) =>
    rows.map((row) => ({
      id: row.id,
      scope: { ...row.scope },
      occurredAt: new Date(row.occurredAt),
      kind,
    }));
  return {
    hasUnknownGenerationTrigger: source.generations.some((row) => row.trigger === 'UNKNOWN'),
    activities: [
      ...entries(
        source.generations.filter((row) => row.trigger === 'USER'),
        'USER_GENERATION',
      ),
      ...entries(source.decisions, 'DECISION'),
      ...entries(source.postRecords, 'POST_REPORT'),
      ...entries(source.copies, 'COPY'),
    ],
  };
}
