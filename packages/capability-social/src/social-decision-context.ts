import { ApplicationError } from '@bunshin/shared';

import type { DailyMissionPlannerInput } from './mission-generation';
import {
  MISSION_ACTIVITY_TYPES,
  MISSION_DECISIONS,
  MISSION_REJECTION_REASONS,
  type MissionActivity,
  type MissionDecision,
} from './mission-engagement';
import {
  MISSION_FEEDBACK_RATINGS,
  type MissionFeedback,
  type PostRecord,
} from './mission-outcomes';
import {
  SOCIAL_ACCOUNT_STRATEGY_GOALS,
  type SocialAccountStrategyGoal,
} from './social-account-strategy';
import { socialGoalPlanningProfile, type SocialGoalPlanningProfile } from './social-goal';
import { validateEnum } from './social-validation';
import type { WeeklyPlannerInput } from './weekly-plan';
import { localDate, timezone, weeklyNullable, weeklyText } from './weekly-plan-validation';

export const SOCIAL_DECISION_CONTEXT_VERSION = 'social-decision-context-v1';
export const SOCIAL_DECISION_PRIORITY = Object.freeze({
  BOUNDARY: 1,
  CURRENT_GOAL: 2,
  STRATEGY: 2,
  WEEKLY_PLAN: 3,
  BUSINESS_FACTS: 3,
  CAMPAIGN: 3,
  TODAY: 3,
  RECENT_POSTS: 4,
  DECISION: 4,
  ACTIVITY: 4,
  FEEDBACK: 4,
  POST: 4,
  PERFORMANCE: 5,
  OUTCOME: 5,
  SEASON: 6,
  TREND: 6,
} as const);
export type SocialDecisionSignalType = keyof typeof SOCIAL_DECISION_PRIORITY;

export interface SocialDecisionScope {
  workspaceId: string;
  groupId: string | null;
  ownerUserId: string;
  bunshinId: string;
}
/** Must be assembled by an already-authorized loader, never from public input. */
export interface SocialDecisionSource<T> {
  scope: SocialDecisionScope;
  data: T;
}
export type SocialDecisionBoundaryStatus = 'PASSED' | 'BLOCKED' | 'UNKNOWN';
export interface SocialDecisionBoundary {
  authorization: SocialDecisionBoundaryStatus;
  capability: SocialDecisionBoundaryStatus;
  ownership: SocialDecisionBoundaryStatus;
  safetyLegal: SocialDecisionBoundaryStatus;
}
type RecentPerformance = NonNullable<WeeklyPlannerInput['recentPerformance']>;
type StrongTopic = NonNullable<RecentPerformance['postPerformance']>['strongTopics'][number];
export type SocialDecisionPerformance = {
  topic: StrongTopic['topic'];
  metrics: { [K in Exclude<keyof StrongTopic, 'topic'>]: StrongTopic[K] | null };
};
export type SocialDecisionMetric =
  { status: 'MEASURED'; value: number } | { status: 'UNKNOWN'; value: null };

/** Read projections: do not invent unselected persistence or audit columns. */
export type SocialDecisionHistoryDecision = Pick<
  MissionDecision,
  | 'id'
  | 'workspaceId'
  | 'bunshinId'
  | 'dailyMissionId'
  | 'decision'
  | 'rejectionReason'
  | 'rejectionDetail'
  | 'decidedAt'
>;
export type SocialDecisionHistoryActivity = Pick<
  MissionActivity,
  'id' | 'workspaceId' | 'bunshinId' | 'dailyMissionId' | 'actorUserId' | 'type' | 'occurredAt'
>;
export type SocialDecisionHistoryFeedback = Pick<
  MissionFeedback,
  'id' | 'workspaceId' | 'bunshinId' | 'dailyMissionId' | 'actorUserId' | 'rating' | 'updatedAt'
>;
export type SocialDecisionHistoryPost = Pick<
  PostRecord,
  'id' | 'workspaceId' | 'bunshinId' | 'dailyMissionId' | 'actorUserId' | 'platform' | 'postedAt'
>;
export type SocialDecisionObservation =
  | { id: string; type: 'DECISION'; data: SocialDecisionHistoryDecision }
  | { id: string; type: 'ACTIVITY'; data: SocialDecisionHistoryActivity }
  | { id: string; type: 'FEEDBACK'; data: SocialDecisionHistoryFeedback }
  | { id: string; type: 'POST'; data: SocialDecisionHistoryPost }
  | {
      id: string;
      type: 'PERFORMANCE';
      goalAtObservation: SocialAccountStrategyGoal | null;
      data: SocialDecisionPerformance;
    }
  | { id: string; type: 'OUTCOME'; data: NonNullable<RecentPerformance['goalEvaluation']> };

export interface SocialDecisionContextInput {
  scope: SocialDecisionScope;
  boundary: SocialDecisionBoundary;
  missionDate: DailyMissionPlannerInput['missionDate'];
  timezone: DailyMissionPlannerInput['timezone'];
  currentGoal: SocialAccountStrategyGoal | null;
  socialProfile?: SocialDecisionSource<DailyMissionPlannerInput['socialProfile']> | null;
  approvedStrategy?: SocialDecisionSource<DailyMissionPlannerInput['approvedStrategy']> | null;
  weeklyPlan?: SocialDecisionSource<DailyMissionPlannerInput['weeklyPlan']> | null;
  businessProfile?: SocialDecisionSource<
    NonNullable<DailyMissionPlannerInput['businessProfile']>
  > | null;
  recentPosts?: SocialDecisionSource<NonNullable<DailyMissionPlannerInput['recentTopics']>> | null;
  campaign?: SocialDecisionSource<NonNullable<DailyMissionPlannerInput['campaign']>> | null;
  today?: SocialDecisionSource<{
    availableMinutes: DailyMissionPlannerInput['approvedStrategy']['availableMinutes'] | null;
    ownerNote: string | null;
  }> | null;
  observations?: readonly SocialDecisionSource<SocialDecisionObservation>[];
  season?: SocialDecisionSource<{ summary: string; sourceRef: string }> | null;
  trends?: SocialDecisionSource<NonNullable<DailyMissionPlannerInput['trendIdeas']>> | null;
}

type SocialDecisionObservationSignalData = {
  observation: ReturnType<typeof observationData>;
  goalAtObservation: SocialAccountStrategyGoal | null;
};
export interface SocialDecisionSignalPayloads {
  BOUNDARY: SocialDecisionBoundary;
  CURRENT_GOAL: SocialAccountStrategyGoal;
  STRATEGY: DailyMissionPlannerInput['approvedStrategy'];
  WEEKLY_PLAN: DailyMissionPlannerInput['weeklyPlan'];
  BUSINESS_FACTS: NonNullable<DailyMissionPlannerInput['businessProfile']>;
  CAMPAIGN: NonNullable<DailyMissionPlannerInput['campaign']>;
  TODAY: { availableMinutes: 3 | 5 | 10 | 20 | null; ownerNote: string | null };
  RECENT_POSTS: NonNullable<DailyMissionPlannerInput['recentTopics']>;
  DECISION: SocialDecisionObservationSignalData;
  ACTIVITY: SocialDecisionObservationSignalData;
  FEEDBACK: SocialDecisionObservationSignalData;
  POST: SocialDecisionObservationSignalData;
  PERFORMANCE: SocialDecisionObservationSignalData;
  OUTCOME: SocialDecisionObservationSignalData;
  SEASON: { summary: string; sourceRef: string };
  TREND: NonNullable<DailyMissionPlannerInput['trendIdeas']>;
}
interface SocialDecisionSignalMetadata {
  id: string;
  priority: number;
  interpretation: 'CONSTRAINT' | 'PREFERENCE_OR_HISTORY' | 'OBSERVATION_NOT_CAUSATION' | 'CONTEXT';
  ignoredReason: 'OTHER_GOAL' | 'UNKNOWN_GOAL' | 'NO_OBSERVATION' | null;
}
export type SocialDecisionSignal = {
  [K in SocialDecisionSignalType]: SocialDecisionSignalMetadata & {
    type: K;
    data: SocialDecisionSignalPayloads[K];
  };
}[SocialDecisionSignalType];
export interface SocialDecisionContext {
  version: typeof SOCIAL_DECISION_CONTEXT_VERSION;
  scope: SocialDecisionScope;
  missionDate: string;
  timezone: string;
  currentGoal: SocialAccountStrategyGoal | null;
  goalPlanning: SocialGoalPlanningProfile | null;
  status: 'READY' | 'REVIEW_REQUIRED' | 'BLOCKED';
  missingInputs: string[];
  reviewReasons: string[];
  evidenceCompleteness: 'HIGH' | 'MEDIUM' | 'LOW';
  signals: SocialDecisionSignal[];
  /** Eligible inputs, not a claim that an AI actually used them or selected a post. */
  orderedSignals: SocialDecisionSignal[];
  limitations: readonly string[];
}

function assertScope(expected: SocialDecisionScope, actual: SocialDecisionScope) {
  if (
    expected.workspaceId !== actual.workspaceId ||
    expected.groupId !== actual.groupId ||
    expected.ownerUserId !== actual.ownerUserId ||
    expected.bunshinId !== actual.bunshinId
  )
    throw new ApplicationError('FORBIDDEN', 'decision source scope mismatch');
}
function assertRowScope(
  scope: SocialDecisionScope,
  row: {
    workspaceId: string;
    bunshinId: string;
    actorUserId?: string;
  },
  actorRequired = false,
) {
  if (
    row.workspaceId !== scope.workspaceId ||
    row.bunshinId !== scope.bunshinId ||
    ((actorRequired || row.actorUserId !== undefined) && row.actorUserId !== scope.ownerUserId)
  )
    throw new ApplicationError('FORBIDDEN', 'decision row scope mismatch');
}
function metric(value: number | null): SocialDecisionMetric {
  if (value === null) return { status: 'UNKNOWN', value: null };
  if (!Number.isFinite(value) || value < 0)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid observed metric');
  return { status: 'MEASURED', value };
}
function observationData(observation: SocialDecisionObservation, scope: SocialDecisionScope) {
  switch (observation.type) {
    case 'DECISION':
      assertRowScope(scope, observation.data);
      validateEnum(observation.data.decision, MISSION_DECISIONS, 'decision');
      if (observation.data.rejectionReason !== null)
        validateEnum(
          observation.data.rejectionReason,
          MISSION_REJECTION_REASONS,
          'rejection reason',
        );
      return observation.data;
    case 'ACTIVITY':
      assertRowScope(scope, observation.data, true);
      validateEnum(observation.data.type, MISSION_ACTIVITY_TYPES, 'activity');
      return observation.data;
    case 'FEEDBACK':
      assertRowScope(scope, observation.data, true);
      validateEnum(observation.data.rating, MISSION_FEEDBACK_RATINGS, 'feedback');
      return observation.data;
    case 'POST':
      assertRowScope(scope, observation.data, true);
      return observation.data;
    case 'PERFORMANCE':
      return {
        topic: weeklyText(observation.data.topic, 200, 'performance topic'),
        metrics: {
          engagementScore: metric(observation.data.metrics.engagementScore),
          saves: metric(observation.data.metrics.saves),
          shares: metric(observation.data.metrics.shares),
          comments: metric(observation.data.metrics.comments),
          follows: metric(observation.data.metrics.follows),
        },
      };
    case 'OUTCOME': {
      const value = observation.data;
      validateEnum(
        value.status,
        ['MEASURED', 'SELF_REPORTED', 'NO_DATA', 'UNAVAILABLE'],
        'outcome',
      );
      if (value.feedbackMeaning !== 'CONTENT_PREFERENCE_NOT_GOAL_ACHIEVEMENT')
        throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback meaning');
      return {
        ...value,
        primaryOutcomeTotal: metric(value.status === 'MEASURED' ? value.primaryOutcomeTotal : null),
      };
    }
  }
}

/** Pure normalization/policy only: no authorization, AI, persistence or candidate selection. */
export function normalizeSocialDecisionContext(
  input: SocialDecisionContextInput,
): SocialDecisionContext {
  const scope: SocialDecisionScope = {
    workspaceId: weeklyText(input.scope.workspaceId, 200, 'workspace id'),
    groupId: input.scope.groupId === null ? null : weeklyText(input.scope.groupId, 200, 'group id'),
    ownerUserId: weeklyText(input.scope.ownerUserId, 200, 'owner id'),
    bunshinId: weeklyText(input.scope.bunshinId, 200, 'bunshin id'),
  };
  const missionDate = localDate(input.missionDate);
  const zone = timezone(input.timezone);
  const goal =
    input.currentGoal === null
      ? null
      : validateEnum(input.currentGoal, SOCIAL_ACCOUNT_STRATEGY_GOALS, 'current goal');
  const missing: string[] = [];
  const review: string[] = [];
  const signals: SocialDecisionSignal[] = [];
  const add = <K extends SocialDecisionSignalType>(
    id: string,
    type: K,
    data: SocialDecisionSignalPayloads[K],
    ignoredReason: SocialDecisionSignal['ignoredReason'] = null,
  ) => {
    const priority = SOCIAL_DECISION_PRIORITY[type];
    // K ties the payload to its discriminator; TS cannot distribute a generic K here.
    signals.push({
      id,
      type,
      priority,
      data: structuredClone(data),
      ignoredReason,
      interpretation:
        priority <= 3
          ? 'CONSTRAINT'
          : priority === 4
            ? 'PREFERENCE_OR_HISTORY'
            : priority === 5
              ? 'OBSERVATION_NOT_CAUSATION'
              : 'CONTEXT',
    } as SocialDecisionSignal);
  };
  const read = <T>(source: SocialDecisionSource<T> | null | undefined): T | null => {
    if (!source) return null;
    assertScope(scope, source.scope);
    return source.data;
  };
  let blocked = false;
  for (const key of ['authorization', 'capability', 'ownership', 'safetyLegal'] as const) {
    const value = validateEnum(input.boundary[key], ['PASSED', 'BLOCKED', 'UNKNOWN'], key);
    if (value !== 'PASSED') {
      blocked = true;
      missing.push(`BOUNDARY_${key}`);
    }
  }
  add('boundary', 'BOUNDARY', input.boundary);
  if (goal) add('current-goal', 'CURRENT_GOAL', goal);
  else missing.push('CURRENT_GOAL');
  const profile = read(input.socialProfile);
  const strategy = read(input.approvedStrategy);
  const weekly = read(input.weeklyPlan);
  const business = read(input.businessProfile);
  if (profile) {
    assertRowScope(scope, profile);
    if (profile.status !== 'ACTIVE') review.push('PROFILE_NOT_ACTIVE');
  } else missing.push('SOCIAL_PROFILE');
  if (strategy) {
    assertRowScope(scope, strategy);
    validateEnum(strategy.goal, SOCIAL_ACCOUNT_STRATEGY_GOALS, 'strategy goal');
    const effectiveSnapshotStrategy =
      strategy.status === 'SUPERSEDED' &&
      weekly?.strategyId === strategy.id &&
      weekly.strategyGoal === strategy.goal;
    if (
      (strategy.status !== 'APPROVED' && !effectiveSnapshotStrategy) ||
      strategy.approvedAt === null
    )
      review.push('STRATEGY_NOT_APPROVED');
    if (strategy.goal !== goal) review.push('STRATEGY_GOAL_MISMATCH');
    if (
      profile &&
      (strategy.socialProfileId !== profile.id || strategy.platform !== profile.platform)
    )
      review.push('STRATEGY_PROFILE_MISMATCH');
    add('strategy', 'STRATEGY', strategy);
  } else missing.push('APPROVED_STRATEGY');
  if (weekly) {
    assertRowScope(scope, weekly);
    const items = weekly.items.filter((item) => {
      assertRowScope(scope, item);
      if (item.weeklyPlanId !== weekly.id)
        throw new ApplicationError('VALIDATION_ERROR', 'weekly item plan mismatch');
      return item.scheduledDate === missionDate;
    });
    if (weekly.status !== 'CONFIRMED' || weekly.confirmedAt === null)
      review.push('WEEKLY_NOT_CONFIRMED');
    const weekStart = localDate(weekly.weekStartDate, true);
    const dayOffset =
      (Date.parse(`${missionDate}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86400000;
    if (dayOffset < 0 || dayOffset >= 7) review.push('MISSION_OUTSIDE_WEEK');
    if (weekly.strategyGoal !== goal || weekly.strategyId !== strategy?.id)
      review.push('WEEKLY_STRATEGY_MISMATCH');
    if (weekly.socialProfileId !== profile?.id || weekly.timezone !== zone)
      review.push('WEEKLY_PROFILE_OR_TIMEZONE_MISMATCH');
    if (items.length !== 1) review.push('TODAY_WEEKLY_ITEM_NOT_UNIQUE');
    add('weekly', 'WEEKLY_PLAN', weekly);
  } else missing.push('CONFIRMED_WEEKLY_PLAN');
  if (business) {
    for (const field of ['industry', 'businessName', 'productService', 'targetAudience'] as const) {
      if (!business[field].trim()) missing.push(`BUSINESS_PROFILE_${field}`);
    }
    add('business', 'BUSINESS_FACTS', business);
  } else missing.push('BUSINESS_PROFILE');
  const campaign = read(input.campaign);
  if (campaign) {
    if (campaign.productPack.groupId !== scope.groupId)
      throw new ApplicationError('FORBIDDEN', 'campaign group mismatch');
    add('campaign', 'CAMPAIGN', campaign);
  }
  const today = read(input.today);
  if (today) {
    if (today.availableMinutes !== null)
      validateEnum(String(today.availableMinutes), ['3', '5', '10', '20'], 'available minutes');
    add('today', 'TODAY', { ...today, ownerNote: weeklyNullable(today.ownerNote, 1000) });
  }
  const recentPosts = read(input.recentPosts);
  if (recentPosts?.length) add('recent-posts', 'RECENT_POSTS', recentPosts);
  const seen = new Set<string>();
  if ((input.observations?.length ?? 0) > 100)
    throw new ApplicationError('VALIDATION_ERROR', 'too many decision observations');
  for (const source of input.observations ?? []) {
    const observation = read(source)!;
    validateEnum(
      observation.type,
      ['DECISION', 'ACTIVITY', 'FEEDBACK', 'POST', 'PERFORMANCE', 'OUTCOME'],
      'observation type',
    );
    const id = weeklyText(observation.id, 200, 'observation id');
    if (seen.has(id)) throw new ApplicationError('VALIDATION_ERROR', 'duplicate observation id');
    seen.add(id);
    let ignored: SocialDecisionSignal['ignoredReason'] = null;
    if (observation.type === 'PERFORMANCE' || observation.type === 'OUTCOME') {
      const observedGoal =
        observation.type === 'PERFORMANCE' ? observation.goalAtObservation : observation.data.goal;
      if (observedGoal !== null)
        validateEnum(observedGoal, SOCIAL_ACCOUNT_STRATEGY_GOALS, 'observed goal');
      ignored =
        observedGoal === null || goal === null
          ? 'UNKNOWN_GOAL'
          : observedGoal !== goal
            ? 'OTHER_GOAL'
            : null;
      if (
        ignored === null &&
        ((observation.type === 'PERFORMANCE' &&
          Object.values(observation.data.metrics).every((value) => value === null)) ||
          (observation.type === 'OUTCOME' &&
            ['NO_DATA', 'UNAVAILABLE'].includes(observation.data.status)))
      )
        ignored = 'NO_OBSERVATION';
    }
    add(
      `observation:${id}`,
      observation.type,
      {
        observation: observationData(observation, scope),
        goalAtObservation:
          observation.type === 'PERFORMANCE'
            ? observation.goalAtObservation
            : observation.type === 'OUTCOME'
              ? observation.data.goal
              : null,
      },
      ignored,
    );
  }
  const season = read(input.season);
  if (season)
    add('season', 'SEASON', {
      summary: weeklyText(season.summary, 1000, 'season'),
      sourceRef: weeklyText(season.sourceRef, 200, 'season source'),
    });
  const trends = read(input.trends);
  if (trends?.length) add('trends', 'TREND', trends);
  const status = blocked
    ? 'BLOCKED'
    : missing.length || review.length
      ? 'REVIEW_REQUIRED'
      : 'READY';
  const orderedSignals = (status === 'READY' ? signals : [])
    .filter((signal) => signal.ignoredReason === null)
    .sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const hasHistory =
    orderedSignals.some((signal) => signal.priority === 4) ||
    (input.observations ?? []).some(({ data: observation }) => {
      if (observation.type === 'PERFORMANCE')
        return (
          observation.goalAtObservation === goal &&
          Object.values(observation.data.metrics).some((value) => value !== null)
        );
      if (observation.type === 'OUTCOME')
        return (
          observation.data.goal === goal &&
          (observation.data.status === 'MEASURED' || observation.data.status === 'SELF_REPORTED')
        );
      return false;
    });
  return {
    version: SOCIAL_DECISION_CONTEXT_VERSION,
    scope,
    missionDate,
    timezone: zone,
    currentGoal: goal,
    goalPlanning: goal === null ? null : structuredClone(socialGoalPlanningProfile(goal)),
    status,
    missingInputs: missing,
    reviewReasons: review,
    evidenceCompleteness:
      blocked || missing.length || review.length ? 'LOW' : hasHistory ? 'HIGH' : 'MEDIUM',
    signals,
    orderedSignals,
    limitations: [
      'PURE_POLICY_NOT_AUTHORIZATION',
      'OBSERVATIONS_NOT_CAUSAL_EVIDENCE',
      'ENGAGEMENT_NOT_AUTOMATIC_SELECTION',
      'FEEDBACK_NOT_GOAL_ACHIEVEMENT',
      'EVIDENCE_COMPLETENESS_NOT_SUCCESS_PROBABILITY',
    ],
  };
}
