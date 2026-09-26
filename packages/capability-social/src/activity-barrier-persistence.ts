import type {
  InferSocialActivityBarriersInput,
  SocialActivityBarrierCandidate,
  SocialActivityBarrierCategory,
  SocialActivityBarrierEvidence,
  SocialActivityBarrierScope,
} from './activity-barrier';

export const SOCIAL_ACTIVITY_BARRIER_STATUSES = [
  'SUSPECTED',
  'CONFIRMED',
  'RESOLVED',
  'DISMISSED',
] as const;

export type SocialActivityBarrierStatus = (typeof SOCIAL_ACTIVITY_BARRIER_STATUSES)[number];

export type SocialActivityBarrierCase = {
  id: string;
  scope: SocialActivityBarrierScope;
  category: SocialActivityBarrierCategory;
  status: SocialActivityBarrierStatus;
  ruleVersion: string;
  recurrenceCount: number;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  nextEligibleAt: Date | null;
  evidence: SocialActivityBarrierEvidence;
};

export interface SocialActivityBarrierObservationRepository {
  collect(input: {
    scope: SocialActivityBarrierScope;
    from: Date;
    to: Date;
  }): Promise<InferSocialActivityBarriersInput | null>;
}

export interface SocialActivityBarrierCaseRepository {
  saveSuspicions(input: {
    scope: SocialActivityBarrierScope;
    candidates: SocialActivityBarrierCandidate[];
    detectedAt: Date;
  }): Promise<SocialActivityBarrierCase[] | null>;
}

export function socialActivityBarrierEvidenceKey(candidate: SocialActivityBarrierCandidate) {
  const evidence = candidate.evidence;
  return [
    evidence.ruleVersion,
    evidence.evidenceCode,
    candidate.category,
    evidence.observationWindow.from,
    evidence.observationWindow.to,
  ].join(':');
}
