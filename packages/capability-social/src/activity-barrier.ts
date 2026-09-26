import { ApplicationError } from '@bunshin/shared';

export const SOCIAL_ACTIVITY_BARRIER_RULE_VERSION = 'social-activity-barrier-v1' as const;

export const SOCIAL_ACTIVITY_BARRIER_CATEGORIES = [
  'SETUP',
  'HOW_TO',
  'TIME',
  'EFFORT',
  'CONTENT',
  'MEDIA',
  'CONFIDENCE',
  'EFFECT',
  'RESPONSE',
  'LEAD',
  'UNKNOWN',
] as const;

export type SocialActivityBarrierCategory = (typeof SOCIAL_ACTIVITY_BARRIER_CATEGORIES)[number];

export type SocialActivityBarrierScope = {
  workspaceId: string;
  serviceId: string;
  groupMembershipId: string;
  userId: string;
  bunshinId: string;
};

export type SocialActivityBarrierMetrics = {
  onboardingCompleted: boolean;
  lineDelivered: number;
  missionViewed: number;
  missionAccepted: number;
  contentCopied: number;
  postCompleted: number;
  insightRecorded: number;
  positiveResponseRecorded: number;
  conversionActionRecorded: number;
};

export type InferSocialActivityBarriersInput = {
  scope: SocialActivityBarrierScope;
  observationWindow: {
    from: Date;
    to: Date;
    eligibleDays: number;
    excludedSystemIncidentDays: number;
  };
  metrics: SocialActivityBarrierMetrics;
};

export type SocialActivityBarrierEvidence = {
  evidenceCode: SocialActivityBarrierEvidenceCode;
  observationWindow: {
    from: string;
    to: string;
    eligibleDays: number;
    excludedSystemIncidentDays: number;
  };
  metrics: Partial<SocialActivityBarrierMetrics>;
  thresholds: Readonly<Record<string, number>>;
  ruleVersion: typeof SOCIAL_ACTIVITY_BARRIER_RULE_VERSION;
};

export type SocialActivityBarrierCandidate = {
  scope: SocialActivityBarrierScope;
  category: SocialActivityBarrierCategory;
  status: 'SUSPECTED';
  priority: number;
  evidence: SocialActivityBarrierEvidence;
};

type SocialActivityBarrierEvidenceCode =
  | 'ONBOARDING_INCOMPLETE'
  | 'DELIVERED_WITHOUT_VIEW'
  | 'VIEWED_WITHOUT_SELECTION'
  | 'COPIED_WITHOUT_POSTING'
  | 'POSTED_WITHOUT_MEASUREMENT'
  | 'MEASURED_WITHOUT_RESPONSE'
  | 'RESPONSE_WITHOUT_NEXT_STEP';

const THRESHOLDS = {
  delivered: 5,
  maximumViewsAfterDelivery: 1,
  viewed: 4,
  copied: 3,
  postedForMeasurement: 2,
  postedForResponse: 3,
  insights: 2,
  positiveResponses: 2,
} as const;

function validateIdentifier(value: string, field: keyof SocialActivityBarrierScope) {
  if (value.trim().length === 0) {
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  }
}

function validateInput(input: InferSocialActivityBarriersInput) {
  for (const [field, value] of Object.entries(input.scope) as Array<
    [keyof SocialActivityBarrierScope, string]
  >) {
    validateIdentifier(value, field);
  }

  const { from, to, eligibleDays, excludedSystemIncidentDays } = input.observationWindow;
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from.getTime() >= to.getTime() ||
    !Number.isInteger(eligibleDays) ||
    eligibleDays < 0 ||
    !Number.isInteger(excludedSystemIncidentDays) ||
    excludedSystemIncidentDays < 0
  ) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid barrier observation window');
  }

  for (const [field, value] of Object.entries(input.metrics)) {
    if (field === 'onboardingCompleted') continue;
    if (!Number.isInteger(value) || Number(value) < 0) {
      throw new ApplicationError('VALIDATION_ERROR', `invalid barrier metric: ${field}`);
    }
  }
}

function createCandidates(
  input: InferSocialActivityBarriersInput,
  evidenceCode: SocialActivityBarrierEvidenceCode,
  categories: readonly SocialActivityBarrierCategory[],
  metrics: Partial<SocialActivityBarrierMetrics>,
  thresholds: Readonly<Record<string, number>>,
): SocialActivityBarrierCandidate[] {
  const evidence: SocialActivityBarrierEvidence = {
    evidenceCode,
    observationWindow: {
      from: input.observationWindow.from.toISOString(),
      to: input.observationWindow.to.toISOString(),
      eligibleDays: input.observationWindow.eligibleDays,
      excludedSystemIncidentDays: input.observationWindow.excludedSystemIncidentDays,
    },
    metrics,
    thresholds,
    ruleVersion: SOCIAL_ACTIVITY_BARRIER_RULE_VERSION,
  };

  return categories.map((category, index) => ({
    scope: { ...input.scope },
    category,
    status: 'SUSPECTED',
    priority: index + 1,
    evidence,
  }));
}

/**
 * Infers possible barriers from eligible activity aggregates.
 *
 * Counts must already exclude system-incident periods. Behavioural signals are
 * ambiguous, so this function only returns SUSPECTED candidates. A user answer
 * is required before any candidate may be treated as CONFIRMED.
 */
export function inferSocialActivityBarriers(
  input: InferSocialActivityBarriersInput,
): SocialActivityBarrierCandidate[] {
  validateInput(input);

  if (input.observationWindow.eligibleDays === 0) return [];

  const metrics = input.metrics;
  if (!metrics.onboardingCompleted) {
    return createCandidates(input, 'ONBOARDING_INCOMPLETE', ['SETUP'], {}, {});
  }

  if (
    metrics.lineDelivered >= THRESHOLDS.delivered &&
    metrics.missionViewed <= THRESHOLDS.maximumViewsAfterDelivery
  ) {
    return createCandidates(
      input,
      'DELIVERED_WITHOUT_VIEW',
      ['TIME', 'EFFORT', 'HOW_TO'],
      { lineDelivered: metrics.lineDelivered, missionViewed: metrics.missionViewed },
      {
        minimumDelivered: THRESHOLDS.delivered,
        maximumViewed: THRESHOLDS.maximumViewsAfterDelivery,
      },
    );
  }

  if (
    metrics.missionViewed >= THRESHOLDS.viewed &&
    metrics.missionAccepted + metrics.contentCopied === 0
  ) {
    return createCandidates(
      input,
      'VIEWED_WITHOUT_SELECTION',
      ['CONTENT', 'CONFIDENCE', 'HOW_TO'],
      {
        missionViewed: metrics.missionViewed,
        missionAccepted: metrics.missionAccepted,
        contentCopied: metrics.contentCopied,
      },
      { minimumViewed: THRESHOLDS.viewed, maximumSelected: 0 },
    );
  }

  if (metrics.contentCopied >= THRESHOLDS.copied && metrics.postCompleted === 0) {
    return createCandidates(
      input,
      'COPIED_WITHOUT_POSTING',
      ['TIME', 'EFFORT', 'MEDIA', 'CONFIDENCE'],
      { contentCopied: metrics.contentCopied, postCompleted: metrics.postCompleted },
      { minimumCopied: THRESHOLDS.copied, maximumPosted: 0 },
    );
  }

  if (metrics.postCompleted >= THRESHOLDS.postedForMeasurement && metrics.insightRecorded === 0) {
    return createCandidates(
      input,
      'POSTED_WITHOUT_MEASUREMENT',
      ['UNKNOWN'],
      { postCompleted: metrics.postCompleted, insightRecorded: metrics.insightRecorded },
      { minimumPosted: THRESHOLDS.postedForMeasurement, maximumInsights: 0 },
    );
  }

  if (
    metrics.postCompleted >= THRESHOLDS.postedForResponse &&
    metrics.insightRecorded >= THRESHOLDS.insights &&
    metrics.positiveResponseRecorded === 0
  ) {
    return createCandidates(
      input,
      'MEASURED_WITHOUT_RESPONSE',
      ['CONTENT', 'EFFECT'],
      {
        postCompleted: metrics.postCompleted,
        insightRecorded: metrics.insightRecorded,
        positiveResponseRecorded: metrics.positiveResponseRecorded,
      },
      {
        minimumPosted: THRESHOLDS.postedForResponse,
        minimumInsights: THRESHOLDS.insights,
        maximumPositiveResponses: 0,
      },
    );
  }

  if (
    metrics.positiveResponseRecorded >= THRESHOLDS.positiveResponses &&
    metrics.conversionActionRecorded === 0
  ) {
    return createCandidates(
      input,
      'RESPONSE_WITHOUT_NEXT_STEP',
      ['LEAD', 'RESPONSE'],
      {
        positiveResponseRecorded: metrics.positiveResponseRecorded,
        conversionActionRecorded: metrics.conversionActionRecorded,
      },
      { minimumPositiveResponses: THRESHOLDS.positiveResponses, maximumConversionActions: 0 },
    );
  }

  return [];
}
