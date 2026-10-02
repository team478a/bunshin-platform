import { ApplicationError } from '@bunshin/shared';
import {
  SOCIAL_ACCOUNT_STRATEGY_GOALS,
  type SocialAccountStrategyGoal,
} from './social-account-strategy';

export const SOCIAL_ACTIVITY_BARRIER_RULE_VERSION = 'social-activity-barrier-v3' as const;
export type SocialActivityBarrierRuleVersion =
  | 'social-activity-barrier-v1'
  | 'social-activity-barrier-v2'
  | typeof SOCIAL_ACTIVITY_BARRIER_RULE_VERSION;

export const SOCIAL_ACTIVITY_BARRIER_GOAL_KEYS = [
  ...SOCIAL_ACCOUNT_STRATEGY_GOALS,
  'UNATTRIBUTED',
] as const;
export type SocialActivityBarrierGoalKey = (typeof SOCIAL_ACTIVITY_BARRIER_GOAL_KEYS)[number];

export type SocialActivityBarrierGoalAttribution = {
  missionCounts: Record<SocialActivityBarrierGoalKey, number>;
  observedMissionCount: number;
  attributedMissionCount: number;
  unattributedMissionCount: number;
  distinctAttributedGoalCount: number;
  mixedAttributedGoals: boolean;
};

export type SocialActivityBarrierGoalMetricCounts = {
  postCompleted: number;
  positiveResponseRecorded: number;
  conversionActionRecorded: number;
};

export type SocialActivityBarrierGoalMetrics = {
  missionMetrics: Record<SocialActivityBarrierGoalKey, SocialActivityBarrierGoalMetricCounts>;
  unattributedAccountMetrics: {
    insightRecorded: number;
    positiveResponseRecorded: number;
  };
};

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
  goalAttribution: SocialActivityBarrierGoalAttribution;
  goalMetrics: SocialActivityBarrierGoalMetrics;
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
  goalAttribution: SocialActivityBarrierGoalAttribution | null;
  goalMetrics: SocialActivityBarrierGoalMetrics | null;
  thresholds: Readonly<Record<string, number>>;
  ruleVersion: SocialActivityBarrierRuleVersion;
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

function emptyGoalCounts(): Record<SocialActivityBarrierGoalKey, number> {
  return Object.fromEntries(SOCIAL_ACTIVITY_BARRIER_GOAL_KEYS.map((goal) => [goal, 0])) as Record<
    SocialActivityBarrierGoalKey,
    number
  >;
}

function emptyGoalMetricCounts(): SocialActivityBarrierGoalMetricCounts {
  return { postCompleted: 0, positiveResponseRecorded: 0, conversionActionRecorded: 0 };
}

function emptyGoalMetrics(): Record<
  SocialActivityBarrierGoalKey,
  SocialActivityBarrierGoalMetricCounts
> {
  return Object.fromEntries(
    SOCIAL_ACTIVITY_BARRIER_GOAL_KEYS.map((goal) => [goal, emptyGoalMetricCounts()]),
  ) as Record<SocialActivityBarrierGoalKey, SocialActivityBarrierGoalMetricCounts>;
}

function isStrategyGoal(value: unknown): value is SocialAccountStrategyGoal {
  return (
    typeof value === 'string' &&
    (SOCIAL_ACCOUNT_STRATEGY_GOALS as readonly string[]).includes(value)
  );
}

export function readSocialActivityBarrierMissionGoal(
  value: unknown,
): SocialAccountStrategyGoal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const strategy = (value as Record<string, unknown>)['strategy'];
  if (!strategy || typeof strategy !== 'object' || Array.isArray(strategy)) return null;
  const goal = (strategy as Record<string, unknown>)['goal'];
  return isStrategyGoal(goal) ? goal : null;
}

export function buildSocialActivityBarrierGoalAttribution(
  goals: readonly (SocialAccountStrategyGoal | null)[],
): SocialActivityBarrierGoalAttribution {
  const missionCounts = emptyGoalCounts();
  for (const goal of goals) missionCounts[goal ?? 'UNATTRIBUTED'] += 1;
  const attributedGoals = SOCIAL_ACCOUNT_STRATEGY_GOALS.filter((goal) => missionCounts[goal] > 0);
  const unattributedMissionCount = missionCounts.UNATTRIBUTED;
  return {
    missionCounts,
    observedMissionCount: goals.length,
    attributedMissionCount: goals.length - unattributedMissionCount,
    unattributedMissionCount,
    distinctAttributedGoalCount: attributedGoals.length,
    mixedAttributedGoals: attributedGoals.length > 1,
  };
}

export function buildSocialActivityBarrierGoalMetrics(
  missions: readonly {
    goal: SocialAccountStrategyGoal | null;
    postCompleted: boolean;
    positiveResponseRecorded: boolean;
    conversionActionRecorded: boolean;
  }[],
  accountMetrics: {
    insightRecorded: number;
    positiveResponseRecorded: number;
  },
): SocialActivityBarrierGoalMetrics {
  const missionMetrics = emptyGoalMetrics();
  for (const mission of missions) {
    const metrics = missionMetrics[mission.goal ?? 'UNATTRIBUTED'];
    if (mission.postCompleted) metrics.postCompleted += 1;
    if (mission.positiveResponseRecorded) metrics.positiveResponseRecorded += 1;
    if (mission.conversionActionRecorded) metrics.conversionActionRecorded += 1;
  }
  return {
    missionMetrics,
    unattributedAccountMetrics: { ...accountMetrics },
  };
}

function readMetricCounts(value: unknown): SocialActivityBarrierGoalMetricCounts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const keys = ['postCompleted', 'positiveResponseRecorded', 'conversionActionRecorded'] as const;
  if (keys.some((key) => !Number.isInteger(candidate[key]) || Number(candidate[key]) < 0)) {
    return null;
  }
  return {
    postCompleted: Number(candidate['postCompleted']),
    positiveResponseRecorded: Number(candidate['positiveResponseRecorded']),
    conversionActionRecorded: Number(candidate['conversionActionRecorded']),
  };
}

export function readSocialActivityBarrierGoalMetrics(
  value: unknown,
): SocialActivityBarrierGoalMetrics | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const storedMissionMetrics = candidate['missionMetrics'];
  if (
    !storedMissionMetrics ||
    typeof storedMissionMetrics !== 'object' ||
    Array.isArray(storedMissionMetrics)
  )
    return null;
  const metricRecord = storedMissionMetrics as Record<string, unknown>;
  const entries = SOCIAL_ACTIVITY_BARRIER_GOAL_KEYS.map((goal) => {
    const metrics = readMetricCounts(metricRecord[goal]);
    return metrics === null ? null : ([goal, metrics] as const);
  });
  if (entries.some((entry) => entry === null)) return null;
  const accountMetrics = candidate['unattributedAccountMetrics'];
  if (!accountMetrics || typeof accountMetrics !== 'object' || Array.isArray(accountMetrics))
    return null;
  const account = accountMetrics as Record<string, unknown>;
  if (
    !Number.isInteger(account['insightRecorded']) ||
    Number(account['insightRecorded']) < 0 ||
    !Number.isInteger(account['positiveResponseRecorded']) ||
    Number(account['positiveResponseRecorded']) < 0
  )
    return null;
  return {
    missionMetrics: Object.fromEntries(
      entries as Array<
        readonly [SocialActivityBarrierGoalKey, SocialActivityBarrierGoalMetricCounts]
      >,
    ) as Record<SocialActivityBarrierGoalKey, SocialActivityBarrierGoalMetricCounts>,
    unattributedAccountMetrics: {
      insightRecorded: Number(account['insightRecorded']),
      positiveResponseRecorded: Number(account['positiveResponseRecorded']),
    },
  };
}

export function socialActivityBarrierGoalMetricsMatchAttribution(
  goalMetrics: SocialActivityBarrierGoalMetrics,
  goalAttribution: SocialActivityBarrierGoalAttribution,
) {
  return (
    SOCIAL_ACTIVITY_BARRIER_GOAL_KEYS.every((goal) => {
      const metrics = goalMetrics.missionMetrics[goal];
      return (
        metrics.postCompleted <= goalAttribution.missionCounts[goal] &&
        metrics.positiveResponseRecorded <= metrics.postCompleted &&
        metrics.conversionActionRecorded <= metrics.postCompleted
      );
    }) &&
    goalMetrics.unattributedAccountMetrics.positiveResponseRecorded <=
      goalMetrics.unattributedAccountMetrics.insightRecorded
  );
}

export function readSocialActivityBarrierGoalAttribution(
  value: unknown,
): SocialActivityBarrierGoalAttribution | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const missionCounts = candidate['missionCounts'];
  if (!missionCounts || typeof missionCounts !== 'object' || Array.isArray(missionCounts))
    return null;
  const counts = missionCounts as Record<string, unknown>;
  if (
    SOCIAL_ACTIVITY_BARRIER_GOAL_KEYS.some(
      (goal) => !Number.isInteger(counts[goal]) || Number(counts[goal]) < 0,
    )
  )
    return null;
  const parsedCounts = Object.fromEntries(
    SOCIAL_ACTIVITY_BARRIER_GOAL_KEYS.map((goal) => [goal, Number(counts[goal])]),
  ) as Record<SocialActivityBarrierGoalKey, number>;
  const observedMissionCount = SOCIAL_ACTIVITY_BARRIER_GOAL_KEYS.reduce(
    (total, goal) => total + parsedCounts[goal],
    0,
  );
  const unattributedMissionCount = parsedCounts.UNATTRIBUTED;
  const attributedMissionCount = observedMissionCount - unattributedMissionCount;
  const distinctAttributedGoalCount = SOCIAL_ACCOUNT_STRATEGY_GOALS.filter(
    (goal) => parsedCounts[goal] > 0,
  ).length;
  const mixedAttributedGoals = distinctAttributedGoalCount > 1;
  if (
    candidate['observedMissionCount'] !== observedMissionCount ||
    candidate['attributedMissionCount'] !== attributedMissionCount ||
    candidate['unattributedMissionCount'] !== unattributedMissionCount ||
    candidate['distinctAttributedGoalCount'] !== distinctAttributedGoalCount ||
    candidate['mixedAttributedGoals'] !== mixedAttributedGoals
  )
    return null;
  return {
    missionCounts: parsedCounts,
    observedMissionCount,
    attributedMissionCount,
    unattributedMissionCount,
    distinctAttributedGoalCount,
    mixedAttributedGoals,
  };
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
  if (readSocialActivityBarrierGoalAttribution(input.goalAttribution) === null) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid barrier goal attribution');
  }
  if (readSocialActivityBarrierGoalMetrics(input.goalMetrics) === null) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid barrier goal metrics');
  }
  if (!socialActivityBarrierGoalMetricsMatchAttribution(input.goalMetrics, input.goalAttribution)) {
    throw new ApplicationError('VALIDATION_ERROR', 'inconsistent barrier goal metrics');
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
    goalAttribution: input.goalAttribution,
    goalMetrics: input.goalMetrics,
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
