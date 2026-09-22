import {
  RequireActiveBunshinCapability,
  type BunshinCapabilityAssignmentRepository,
  type ActivityContinuityRule,
  DEFAULT_ACTIVITY_CONTINUITY_RULE,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export * from './social-profile';
export * from './social-account-strategy';
export * from './content-pillars';
export * from './weekly-plan';
export * from './mission-generation';
export * from './daily-mission-runtime';
export {
  assertPlatformFormat,
  normalizeMissionContent,
  type MissionContent,
} from './mission-content';
export * from './trend-research';
import { missionInteger, missionString, strict } from './mission-content';
import { DailyMissionMutation } from './daily-mission-authorization';
import type { DailyMissionRepository, DailyMissionScope } from './daily-mission-runtime';
import { SOCIAL_PLATFORMS, type SocialPlatform } from './social-profile';
import { localDate } from './weekly-plan-validation';
export const MISSION_DECISIONS = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type MissionDecisionValue = (typeof MISSION_DECISIONS)[number];
export const MISSION_REJECTION_REASONS = [
  'NOT_MY_STYLE',
  'WRONG_TOPIC',
  'TOO_DIFFICULT',
  'TOO_MUCH_WORK',
  'SIMILAR_TO_PAST',
  'TOO_SALESY',
  'NOT_TODAY',
  'OTHER',
] as const;
export type MissionRejectionReason = (typeof MISSION_REJECTION_REASONS)[number];
export const MISSION_ACTIVITY_TYPES = [
  'VIEWED',
  'CONFIRMED',
  'RESTED',
  'EXECUTION_COMPLETED',
  'EXECUTION_PARTIAL',
  'EXECUTION_NOT_COMPLETED',
  'EXECUTION_HELP_NEEDED',
  'ACCEPTED',
  'REJECTED',
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
  'POSTED',
  'FEEDBACK_GOOD',
  'FEEDBACK_NEUTRAL',
  'FEEDBACK_BAD',
] as const;
export type MissionActivityType = (typeof MISSION_ACTIVITY_TYPES)[number];
export interface MissionDecision {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  decision: MissionDecisionValue;
  rejectionReason: MissionRejectionReason | null;
  rejectionDetail: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface MissionActivity {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  type: MissionActivityType;
  occurredAt: Date;
  idempotencyKey: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}
export interface MissionProgressDaySource {
  dailyMissionId: string;
  missionDate: string;
  activities: MissionActivity[];
}
export type MissionProgressDayStatus = 'UNSEEN' | 'CONFIRMED' | 'PREPARED' | 'POSTED' | 'RESTED';
export interface MissionProgressDay {
  dailyMissionId: string;
  missionDate: string;
  status: MissionProgressDayStatus;
}
export interface MissionProgress {
  weekStart: string;
  weekEnd: string;
  weeklyGoal: number;
  remainingConfirmations: number;
  weekly: {
    confirmedDays: number;
    preparedDays: number;
    postedDays: number;
    restedDays: number;
    days: MissionProgressDay[];
  };
  cumulative: {
    confirmedDays: number;
    preparedDays: number;
    postedDays: number;
    restedDays: number;
    activeDays: number;
    lastActiveDate: string | null;
  };
}
export interface MissionEngagementRepository {
  getDecision(
    input: DailyMissionScope & { dailyMissionId: string },
  ): Promise<MissionDecision | null>;
  decide(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    decision: 'ACCEPTED' | 'REJECTED';
    rejectionReason: MissionRejectionReason | null;
    rejectionDetail: string | null;
    idempotencyKey: string;
  }): Promise<{ decision: MissionDecision; activity: MissionActivity } | null>;
  listActivities(
    input: DailyMissionScope & { dailyMissionId: string },
  ): Promise<MissionActivity[] | null>;
  appendActivity(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    type:
      | 'VIEWED'
      | 'CONFIRMED'
      | 'RESTED'
      | 'EXECUTION_COMPLETED'
      | 'EXECUTION_PARTIAL'
      | 'EXECUTION_NOT_COMPLETED'
      | 'EXECUTION_HELP_NEEDED'
      | 'COPIED_TEXT'
      | 'COPIED_SLIDE'
      | 'COPIED_IMAGE_INSTRUCTION'
      | 'COPIED_VIDEO_PROMPT'
      | 'COPIED_SCRIPT';
    idempotencyKey: string;
    metadata: Record<string, unknown> | null;
  }): Promise<MissionActivity | null>;
  listProgressDays(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    from: string | null;
    to: string;
  }): Promise<MissionProgressDaySource[] | null>;
}

function idempotencyKey(value: string) {
  return missionString(value, 200, 'idempotency key');
}
export function normalizeMissionActivityMetadata(
  type: MissionActivityType,
  metadata: unknown,
): Record<string, unknown> | null {
  if (type === 'COPIED_SLIDE') {
    if (metadata === null || metadata === undefined) return null;
    const value = strict(metadata, ['slideIndex'], 'activity metadata');
    return { slideIndex: missionInteger(value['slideIndex'], 1, 7, 'slide index') };
  }
  if (metadata !== null && metadata !== undefined)
    throw new ApplicationError('VALIDATION_ERROR', 'activity metadata is not allowed');
  return null;
}

export class GetMissionDecision {
  constructor(private readonly engagement: MissionEngagementRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.engagement.getDecision(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'mission decision not found');
    return value;
  }
}
export class DecideMission extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly engagement: MissionEngagementRepository,
  ) {
    super(missions, assignments);
  }
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    decision: 'ACCEPTED' | 'REJECTED';
    rejectionReason?: MissionRejectionReason | null;
    rejectionDetail?: string | null;
    idempotencyKey: string;
  }) {
    await this.requireActive(input);
    const rejectionReason = input.rejectionReason ?? null;
    const rejectionDetail = input.rejectionDetail?.trim() || null;
    if (input.decision === 'ACCEPTED' && (rejectionReason !== null || rejectionDetail !== null))
      throw new ApplicationError('VALIDATION_ERROR', 'accepted decision cannot have rejection');
    if (input.decision === 'REJECTED' && !rejectionReason)
      throw new ApplicationError('VALIDATION_ERROR', 'rejection reason is required');
    if (rejectionReason && !MISSION_REJECTION_REASONS.includes(rejectionReason))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rejection reason');
    if (rejectionReason !== 'OTHER' && rejectionDetail !== null)
      throw new ApplicationError('VALIDATION_ERROR', 'rejection detail is only allowed for OTHER');
    if (rejectionDetail && rejectionDetail.length > 1000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rejection detail');
    const value = await this.engagement.decide({
      ...input,
      rejectionReason,
      rejectionDetail,
      idempotencyKey: idempotencyKey(input.idempotencyKey),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}
export class ListMissionActivities {
  constructor(private readonly engagement: MissionEngagementRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.engagement.listActivities(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}
export class RecordMissionActivity extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly engagement: MissionEngagementRepository,
  ) {
    super(missions, assignments);
  }
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    type:
      | 'VIEWED'
      | 'CONFIRMED'
      | 'RESTED'
      | 'EXECUTION_COMPLETED'
      | 'EXECUTION_PARTIAL'
      | 'EXECUTION_NOT_COMPLETED'
      | 'EXECUTION_HELP_NEEDED'
      | 'COPIED_TEXT'
      | 'COPIED_SLIDE'
      | 'COPIED_IMAGE_INSTRUCTION'
      | 'COPIED_VIDEO_PROMPT'
      | 'COPIED_SCRIPT';
    idempotencyKey: string;
    metadata?: Record<string, unknown> | null;
  }) {
    await this.requireActive(input);
    const value = await this.engagement.appendActivity({
      ...input,
      idempotencyKey: idempotencyKey(input.idempotencyKey),
      metadata: normalizeMissionActivityMetadata(input.type, input.metadata),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}

const COPY_ACTIVITY_TYPES = new Set<MissionActivityType>([
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
]);

function progressDay(source: MissionProgressDaySource): MissionProgressDay {
  const types = new Set(source.activities.map((value) => value.type));
  const status: MissionProgressDayStatus = types.has('POSTED')
    ? 'POSTED'
    : source.activities.some((value) => COPY_ACTIVITY_TYPES.has(value.type))
      ? 'PREPARED'
      : types.has('CONFIRMED')
        ? 'CONFIRMED'
        : types.has('RESTED')
          ? 'RESTED'
          : 'UNSEEN';
  return { dailyMissionId: source.dailyMissionId, missionDate: source.missionDate, status };
}

function progressCounts(days: MissionProgressDay[]) {
  return {
    confirmedDays: days.filter((value) =>
      ['CONFIRMED', 'PREPARED', 'POSTED'].includes(value.status),
    ).length,
    preparedDays: days.filter((value) => ['PREPARED', 'POSTED'].includes(value.status)).length,
    postedDays: days.filter((value) => value.status === 'POSTED').length,
    restedDays: days.filter((value) => value.status === 'RESTED').length,
  };
}

export class GetMissionProgress {
  constructor(
    private readonly assignments: BunshinCapabilityAssignmentRepository,
    private readonly engagement: MissionEngagementRepository,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    weekStart: string;
    weekEnd: string;
    weeklyGoal?: number;
  }): Promise<MissionProgress> {
    await new RequireActiveBunshinCapability(this.assignments).execute({
      workspaceId: input.workspaceId,
      ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
      actorUserId: input.actorUserId,
      bunshinId: input.bunshinId,
      capabilityType: 'SOCIAL',
    });
    const weekStart = localDate(input.weekStart);
    const weekEnd = localDate(input.weekEnd);
    const duration = (new Date(weekEnd).valueOf() - new Date(weekStart).valueOf()) / 86400000;
    if (duration < 0 || duration > 6)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid progress week');
    const weeklyGoal = missionInteger(input.weeklyGoal ?? 3, 1, 7, 'weekly goal');
    const scope = {
      workspaceId: input.workspaceId,
      ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
      actorUserId: input.actorUserId,
      bunshinId: input.bunshinId,
    };
    const [weeklySource, cumulativeSource] = await Promise.all([
      this.engagement.listProgressDays({ ...scope, from: weekStart, to: weekEnd }),
      this.engagement.listProgressDays({ ...scope, from: null, to: weekEnd }),
    ]);
    if (!weeklySource || !cumulativeSource)
      throw new ApplicationError('NOT_FOUND', 'mission progress not found');
    const weeklyDays = weeklySource.map(progressDay);
    const cumulativeDays = cumulativeSource.map(progressDay);
    const weekly = progressCounts(weeklyDays);
    const cumulative = progressCounts(cumulativeDays);
    const activeDates = cumulativeDays
      .filter((value) => value.status !== 'UNSEEN')
      .map((value) => value.missionDate);
    return {
      weekStart,
      weekEnd,
      weeklyGoal,
      remainingConfirmations: Math.max(0, weeklyGoal - weekly.confirmedDays),
      weekly: { ...weekly, days: weeklyDays },
      cumulative: {
        ...cumulative,
        activeDays: cumulativeDays.filter((value) => value.status !== 'UNSEEN').length,
        lastActiveDate: activeDates.at(-1) ?? null,
      },
    };
  }
}

export const ACTIVITY_MOTIVATION_RULE = {
  featureKey: 'SOCIAL',
  ruleVersion: DEFAULT_ACTIVITY_CONTINUITY_RULE.version,
  dormancyDays: DEFAULT_ACTIVITY_CONTINUITY_RULE.dormancyDays,
  badges: DEFAULT_ACTIVITY_CONTINUITY_RULE.badges,
} as const;
export interface AchievementBadge {
  id: string;
  workspaceId: string;
  userId: string;
  bunshinId: string;
  featureKey: string;
  badgeKey: string;
  ruleVersion: number;
  labelSnapshot: string;
  descriptionSnapshot: string;
  awardedAt: Date;
}
export interface AchievementBadgeRepository {
  list(input: {
    workspaceId: string;
    userId: string;
    bunshinId: string;
    featureKey: string;
  }): Promise<AchievementBadge[] | null>;
  award(input: Omit<AchievementBadge, 'id' | 'awardedAt'>): Promise<AchievementBadge | null>;
}
export type ActivityStep = 'STARTING' | 'BUILDING' | 'CONTINUING' | 'ESTABLISHED';
export interface ActivityMotivation {
  step: ActivityStep;
  stepLabel: string;
  dormant: boolean;
  dormantSinceDays: number | null;
  returnMessage: string | null;
  badges: AchievementBadge[];
}
function activityStep(
  activeDays: number,
  rule: ActivityContinuityRule,
): { step: ActivityStep; stepLabel: string } {
  if (activeDays >= rule.stepEstablishedDays)
    return { step: 'ESTABLISHED', stepLabel: '発信が習慣になっています' };
  if (activeDays >= rule.stepContinuingDays)
    return { step: 'CONTINUING', stepLabel: '発信を続けています' };
  if (activeDays >= rule.stepBuildingDays)
    return { step: 'BUILDING', stepLabel: '発信の準備が整ってきました' };
  return { step: 'STARTING', stepLabel: 'はじめの一歩' };
}
export class EvaluateActivityMotivation {
  constructor(private readonly badges: AchievementBadgeRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    progress: MissionProgress;
    localDate: string;
    rule?: ActivityContinuityRule;
  }): Promise<ActivityMotivation> {
    const ruleSet = input.rule ?? DEFAULT_ACTIVITY_CONTINUITY_RULE;
    const existing = await this.badges.list({
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      bunshinId: input.bunshinId,
      featureKey: ACTIVITY_MOTIVATION_RULE.featureKey,
    });
    if (existing === null) throw new ApplicationError('NOT_FOUND', 'activity badges not found');
    const metrics = input.progress.cumulative;
    const eligible = ruleSet.badges.filter((rule) => metrics[rule.metric] >= rule.threshold);
    const awarded = await Promise.all(
      eligible.map((rule) =>
        this.badges.award({
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
          featureKey: ACTIVITY_MOTIVATION_RULE.featureKey,
          badgeKey: rule.badgeKey,
          ruleVersion: ruleSet.version,
          labelSnapshot: rule.label,
          descriptionSnapshot: rule.description,
        }),
      ),
    );
    if (awarded.some((value) => value === null))
      throw new ApplicationError('NOT_FOUND', 'activity badge scope not found');
    const merged = new Map(
      [...existing, ...(awarded as AchievementBadge[])].map((value) => [
        `${value.badgeKey}:${value.ruleVersion}`,
        value,
      ]),
    );
    const lastActiveDate = metrics.lastActiveDate;
    const dormantSinceDays = lastActiveDate
      ? Math.floor(
          (new Date(`${input.localDate}T00:00:00.000Z`).valueOf() -
            new Date(`${lastActiveDate}T00:00:00.000Z`).valueOf()) /
            86400000,
        )
      : null;
    const dormant = dormantSinceDays !== null && dormantSinceDays >= ruleSet.dormancyDays;
    return {
      ...activityStep(metrics.activeDays, ruleSet),
      dormant,
      dormantSinceDays,
      returnMessage: dormant ? 'おかえりなさい。今日は内容を見るだけでも大丈夫です。' : null,
      badges: [...merged.values()].sort(
        (left, right) => left.awardedAt.valueOf() - right.awardedAt.valueOf(),
      ),
    };
  }
}

export const POST_SOURCES = ['MANUAL'] as const;
export type PostSource = (typeof POST_SOURCES)[number];
export const MISSION_FEEDBACK_RATINGS = ['GOOD', 'NEUTRAL', 'BAD'] as const;
export type MissionFeedbackRating = (typeof MISSION_FEEDBACK_RATINGS)[number];

export interface PostRecord {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  platform: SocialPlatform;
  postedAt: Date;
  postUrl: string | null;
  externalPostId: string | null;
  source: PostSource;
  manualMetrics: Record<string, unknown> | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface MissionFeedback {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  rating: MissionFeedbackRating;
  createdAt: Date;
  updatedAt: Date;
}
export interface MissionOutcomeRepository {
  getPost(input: DailyMissionScope & { dailyMissionId: string }): Promise<PostRecord | null>;
  recordPost(
    input: DailyMissionScope & {
      dailyMissionId: string;
      platform: SocialPlatform;
      postedAt: Date;
      postUrl: string | null;
      idempotencyKey: string;
    },
  ): Promise<{ post: PostRecord; activity: MissionActivity } | null>;
  getFeedback(
    input: DailyMissionScope & { dailyMissionId: string },
  ): Promise<MissionFeedback | null>;
  recordFeedback(
    input: DailyMissionScope & {
      dailyMissionId: string;
      rating: MissionFeedbackRating;
      idempotencyKey: string;
    },
  ): Promise<{ feedback: MissionFeedback; activity: MissionActivity } | null>;
}

function postUrl(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === '') return null;
  const normalized = value.trim();
  if (normalized.length > 2048) throw new ApplicationError('VALIDATION_ERROR', 'invalid post url');
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid post url');
  }
  return normalized;
}
export class GetPostRecord {
  constructor(private readonly outcomes: MissionOutcomeRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.outcomes.getPost(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'post record not found');
    return value;
  }
}
export class RecordManualPost extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly outcomes: MissionOutcomeRepository,
  ) {
    super(missions, assignments);
  }
  async execute(
    input: DailyMissionScope & {
      dailyMissionId: string;
      platform: SocialPlatform;
      postedAt?: Date;
      postUrl?: string | null;
      idempotencyKey: string;
    },
  ) {
    await this.requireActive(input);
    if (!SOCIAL_PLATFORMS.includes(input.platform))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid platform');
    const postedAt = input.postedAt ?? new Date();
    if (Number.isNaN(postedAt.valueOf()) || postedAt.valueOf() > Date.now() + 5 * 60_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid posted at');
    const value = await this.outcomes.recordPost({
      ...input,
      postedAt,
      postUrl: postUrl(input.postUrl),
      idempotencyKey: idempotencyKey(input.idempotencyKey),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}
export class GetMissionFeedback {
  constructor(private readonly outcomes: MissionOutcomeRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.outcomes.getFeedback(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'mission feedback not found');
    return value;
  }
}
export class RecordMissionFeedback extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly outcomes: MissionOutcomeRepository,
  ) {
    super(missions, assignments);
  }
  async execute(
    input: DailyMissionScope & {
      dailyMissionId: string;
      rating: MissionFeedbackRating;
      idempotencyKey: string;
    },
  ) {
    await this.requireActive(input);
    if (!MISSION_FEEDBACK_RATINGS.includes(input.rating))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback rating');
    const value = await this.outcomes.recordFeedback({
      ...input,
      idempotencyKey: idempotencyKey(input.idempotencyKey),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'post record not found');
    return value;
  }
}

export type TrendSearchFailureCategory =
  | 'AUTHENTICATION'
  | 'RATE_LIMIT'
  | 'QUOTA'
  | 'TIMEOUT_OR_NETWORK'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE';
export interface TrendSearchQuery {
  query: string;
  language: string;
  country: string;
  publishedAfter: Date;
  maximumResults: number;
}
export interface TrendSearchResultItem {
  url: string;
  title: string;
  publishedAt: Date | null;
  highlights: string[];
}
export interface TrendSearchResult {
  providerKey: string;
  items: TrendSearchResultItem[];
  creditsUsed: number | null;
  latencyMs: number;
}
export interface TrendResearchProviderPort {
  search(input: TrendSearchQuery): Promise<TrendSearchResult>;
}

export interface TrendProviderBenchmarkObservation {
  caseId: string;
  providerKey: string;
  query: TrendSearchQuery;
  result: TrendSearchResult | null;
  costUsdMicros: number;
  relevanceRating: number;
  sourceQualityRating: number;
  failed: boolean;
}
export interface TrendProviderBenchmarkScore {
  providerKey: string;
  totalCases: number;
  successfulCases: number;
  averageScore: number;
  averageCostUsdMicros: number;
  averageLatencyMs: number;
  metrics: {
    relevance: number;
    sourceQuality: number;
    coverage: number;
    freshness: number;
    reliability: number;
    costEfficiency: number;
  };
  eligibleForReview: boolean;
}
export interface TrendProviderBenchmarkReport {
  generatedAt: Date;
  scores: TrendProviderBenchmarkScore[];
  recommendation: string | null;
}

function benchmarkAverage(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
function benchmarkPercent(value: number) {
  return Math.round(Math.min(Math.max(value, 0), 100) * 100) / 100;
}
function benchmarkSafeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

export function evaluateTrendProviderBenchmark(
  observations: TrendProviderBenchmarkObservation[],
  expectedCaseIds: string[],
): TrendProviderBenchmarkReport {
  if (observations.length === 0) throw new Error('benchmark observations are required');
  const caseIds = new Set(expectedCaseIds.map((item) => item.trim()).filter(Boolean));
  if (caseIds.size === 0 || caseIds.size !== expectedCaseIds.length)
    throw new Error('unique benchmark case ids are required');
  const grouped = new Map<string, TrendProviderBenchmarkObservation[]>();
  for (const observation of observations) {
    if (!observation.caseId.trim() || !observation.providerKey.trim())
      throw new Error('benchmark identity is required');
    if (!caseIds.has(observation.caseId)) throw new Error('unknown benchmark case');
    if (!Number.isSafeInteger(observation.costUsdMicros) || observation.costUsdMicros < 0)
      throw new Error('benchmark cost must be a non-negative integer');
    if (
      !Number.isInteger(observation.relevanceRating) ||
      observation.relevanceRating < 0 ||
      observation.relevanceRating > 5 ||
      !Number.isInteger(observation.sourceQualityRating) ||
      observation.sourceQualityRating < 0 ||
      observation.sourceQualityRating > 5
    )
      throw new Error('benchmark ratings must be integers from 0 to 5');
    const values = grouped.get(observation.providerKey) ?? [];
    if (values.some((item) => item.caseId === observation.caseId))
      throw new Error('duplicate provider benchmark observation');
    values.push(observation);
    grouped.set(observation.providerKey, values);
  }
  const costs = observations.map((item) => item.costUsdMicros);
  const minimumCost = Math.min(...costs);
  const maximumCost = Math.max(...costs);
  const scores = [...grouped.entries()]
    .map(([providerKey, values]): TrendProviderBenchmarkScore => {
      const successful = values.filter((item) => !item.failed && item.result !== null);
      const relevance = benchmarkPercent(
        benchmarkAverage(values.map((item) => item.relevanceRating)) * 20,
      );
      const sourceQuality = benchmarkPercent(
        benchmarkAverage(values.map((item) => item.sourceQualityRating)) * 20,
      );
      const coverage = benchmarkPercent(
        benchmarkAverage(
          values.map((item) => {
            const valid = new Set(
              item.result?.items
                .filter((result) => benchmarkSafeUrl(result.url))
                .map((result) => result.url) ?? [],
            ).size;
            return (valid / Math.max(item.query.maximumResults, 1)) * 100;
          }),
        ),
      );
      const freshness = benchmarkPercent(
        benchmarkAverage(
          values.map((item) => {
            const dated = item.result?.items.filter((result) => result.publishedAt !== null) ?? [];
            if (dated.length === 0) return 0;
            return (
              (dated.filter((result) => result.publishedAt! >= item.query.publishedAfter).length /
                dated.length) *
              100
            );
          }),
        ),
      );
      const reliability = benchmarkPercent((successful.length / values.length) * 100);
      const averageCost = benchmarkAverage(values.map((item) => item.costUsdMicros));
      const costEfficiency = benchmarkPercent(
        maximumCost === minimumCost
          ? 100
          : ((maximumCost - averageCost) / (maximumCost - minimumCost)) * 100,
      );
      const averageScore = benchmarkPercent(
        relevance * 0.3 +
          sourceQuality * 0.25 +
          coverage * 0.15 +
          freshness * 0.15 +
          reliability * 0.1 +
          costEfficiency * 0.05,
      );
      return {
        providerKey,
        totalCases: values.length,
        successfulCases: successful.length,
        averageScore,
        averageCostUsdMicros: Math.round(averageCost),
        averageLatencyMs: Math.round(
          benchmarkAverage(values.map((item) => item.result?.latencyMs ?? 0)),
        ),
        metrics: { relevance, sourceQuality, coverage, freshness, reliability, costEfficiency },
        eligibleForReview:
          values.length === caseIds.size &&
          successful.length === values.length &&
          relevance >= 70 &&
          sourceQuality >= 70 &&
          coverage >= 60,
      };
    })
    .sort((left, right) => right.averageScore - left.averageScore);
  const eligible = scores.filter((item) => item.eligibleForReview);
  return {
    generatedAt: new Date(),
    scores,
    recommendation: eligible.length === 1 ? eligible[0]!.providerKey : null,
  };
}

export function formatTrendProviderBenchmarkMarkdown(report: TrendProviderBenchmarkReport) {
  const rows = report.scores.map(
    (score) =>
      `| ${score.providerKey} | ${score.averageScore.toFixed(2)} | ${score.successfulCases}/${score.totalCases} | ${score.metrics.relevance.toFixed(2)} | ${score.metrics.sourceQuality.toFixed(2)} | ${score.metrics.coverage.toFixed(2)} | ${score.metrics.freshness.toFixed(2)} | $${(score.averageCostUsdMicros / 1_000_000).toFixed(4)} | ${score.averageLatencyMs}ms | ${score.eligibleForReview ? '候補' : '要改善'} |`,
  );
  return [
    '# トレンド調査Provider比較結果',
    '',
    '| Provider | 総合点 | 成功 | 関連性 | 出典品質 | 根拠充足 | 鮮度確認 | 平均原価 | 平均時間 | 判定 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows,
    '',
    `単独推奨: ${report.recommendation ?? 'なし（人間レビューまたは追加比較が必要）'}`,
    '',
    '> この結果はProviderの自動有効化を行いません。関連性と出典品質は人間が0〜5で採点します。',
  ].join('\n');
}

export const GOLDEN_EVALUATION_OUTCOMES = ['ACCEPTED', 'REJECTED', 'FALLBACK'] as const;
export type GoldenEvaluationOutcome = (typeof GOLDEN_EVALUATION_OUTCOMES)[number];
export const GOLDEN_DATA_CLASSES = [
  'PUBLIC',
  'INTERNAL',
  'USER_PRIVATE',
  'RESTRICTED',
  'SECRET',
] as const;
export type GoldenDataClass = (typeof GOLDEN_DATA_CLASSES)[number];
export const GOLDEN_ALLOWED_TOOLS = [
  'TREND_EVIDENCE_READ',
  'BUNSHIN_CONTEXT_READ',
  'KNOWLEDGE_GRANT_READ',
  'CANDIDATE_SUBMIT',
] as const;
export type GoldenAllowedTool = (typeof GOLDEN_ALLOWED_TOOLS)[number];
export const GOLDEN_VIOLATION_CODES = [
  'OUTCOME_MISMATCH',
  'FAILURE_CATEGORY_MISMATCH',
  'FORBIDDEN_FRAGMENT',
  'DATA_POLICY_VIOLATION',
  'TOOL_POLICY_VIOLATION',
  'COST_LIMIT_EXCEEDED',
  'LATENCY_LIMIT_EXCEEDED',
  'RETRY_LIMIT_EXCEEDED',
  'RESULT_COUNT_EXCEEDED',
  'UNSAFE_URL',
] as const;
export type GoldenViolationCode = (typeof GOLDEN_VIOLATION_CODES)[number];

export interface GoldenDatasetCase {
  id: string;
  category: string;
  input: TrendSearchQuery;
  expectation: {
    outcome: GoldenEvaluationOutcome;
    failureCategory: TrendSearchFailureCategory | null;
    allowedDataClasses: GoldenDataClass[];
    allowedTools: GoldenAllowedTool[];
    forbiddenFragments: string[];
    maximumCostUsdMicros: number;
    maximumLatencyMs: number;
    maximumRetries: number;
  };
}
export interface GoldenDataset {
  version: string;
  cases: GoldenDatasetCase[];
}
export interface GoldenEvaluationObservation {
  outcome: GoldenEvaluationOutcome;
  failureCategory: TrendSearchFailureCategory | null;
  result: TrendSearchResult | null;
  emittedText: string[];
  accessedDataClasses: GoldenDataClass[];
  attemptedTools: string[];
  costUsdMicros: number;
  latencyMs: number;
  retryCount: number;
}
export interface GoldenEvaluationReport {
  caseId: string;
  passed: boolean;
  violations: GoldenViolationCode[];
}
export const GOLDEN_RUN_CONFIGURATION_ERROR_CODES = [
  'MISSING_OBSERVATION',
  'DUPLICATE_OBSERVATION',
  'UNKNOWN_CASE',
] as const;
export type GoldenRunConfigurationErrorCode = (typeof GOLDEN_RUN_CONFIGURATION_ERROR_CODES)[number];
export interface GoldenDatasetObservation {
  caseId: string;
  observation: GoldenEvaluationObservation;
}
export interface GoldenDatasetRunReport {
  datasetVersion: string;
  passed: boolean;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  reports: GoldenEvaluationReport[];
  configurationErrors: Array<{ code: GoldenRunConfigurationErrorCode; caseId: string }>;
}

function goldenUnique<T>(values: T[]) {
  return [...new Set(values)];
}
function goldenHasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return expected.length === actual.length && expected.every((key, index) => key === actual[index]);
}
function goldenSafeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}
export function evaluateGoldenDatasetCase(
  testCase: GoldenDatasetCase,
  observation: GoldenEvaluationObservation,
): GoldenEvaluationReport {
  const violations: GoldenViolationCode[] = [];
  const expected = testCase.expectation;
  if (observation.outcome !== expected.outcome) violations.push('OUTCOME_MISMATCH');
  if (observation.failureCategory !== expected.failureCategory)
    violations.push('FAILURE_CATEGORY_MISMATCH');
  const resultText =
    observation.result?.items.flatMap((item) => [item.title, ...item.highlights]) ?? [];
  const text = [...observation.emittedText, ...resultText].join('\n').toLocaleLowerCase('ja-JP');
  if (
    expected.forbiddenFragments.some((fragment) =>
      text.includes(fragment.toLocaleLowerCase('ja-JP')),
    )
  )
    violations.push('FORBIDDEN_FRAGMENT');
  if (
    observation.accessedDataClasses.some(
      (dataClass) => !expected.allowedDataClasses.includes(dataClass),
    )
  )
    violations.push('DATA_POLICY_VIOLATION');
  if (
    observation.attemptedTools.some(
      (tool) => !expected.allowedTools.includes(tool as GoldenAllowedTool),
    )
  )
    violations.push('TOOL_POLICY_VIOLATION');
  if (observation.costUsdMicros > expected.maximumCostUsdMicros)
    violations.push('COST_LIMIT_EXCEEDED');
  if (observation.latencyMs > expected.maximumLatencyMs) violations.push('LATENCY_LIMIT_EXCEEDED');
  if (observation.retryCount > expected.maximumRetries) violations.push('RETRY_LIMIT_EXCEEDED');
  if (observation.result && observation.result.items.length > testCase.input.maximumResults)
    violations.push('RESULT_COUNT_EXCEEDED');
  if (observation.result?.items.some((item) => !goldenSafeUrl(item.url)))
    violations.push('UNSAFE_URL');
  const unique = goldenUnique(violations);
  return { caseId: testCase.id, passed: unique.length === 0, violations: unique };
}

export function runGoldenDatasetRegression(
  dataset: GoldenDataset,
  observations: GoldenDatasetObservation[],
): GoldenDatasetRunReport {
  const knownIds = new Set(dataset.cases.map((item) => item.id));
  const grouped = new Map<string, GoldenEvaluationObservation[]>();
  for (const item of observations) {
    const values = grouped.get(item.caseId) ?? [];
    values.push(item.observation);
    grouped.set(item.caseId, values);
  }
  const configurationErrors: GoldenDatasetRunReport['configurationErrors'] = [];
  for (const caseId of grouped.keys()) {
    if (!knownIds.has(caseId)) configurationErrors.push({ code: 'UNKNOWN_CASE', caseId });
  }
  const reports: GoldenEvaluationReport[] = [];
  for (const testCase of dataset.cases) {
    const values = grouped.get(testCase.id) ?? [];
    if (values.length === 0) {
      configurationErrors.push({ code: 'MISSING_OBSERVATION', caseId: testCase.id });
      continue;
    }
    if (values.length > 1) {
      configurationErrors.push({ code: 'DUPLICATE_OBSERVATION', caseId: testCase.id });
      continue;
    }
    const observation = values[0];
    if (observation) reports.push(evaluateGoldenDatasetCase(testCase, observation));
  }
  const passedCases = reports.filter((item) => item.passed).length;
  const failedCases = dataset.cases.length - passedCases;
  return {
    datasetVersion: dataset.version,
    passed: configurationErrors.length === 0 && failedCases === 0,
    totalCases: dataset.cases.length,
    passedCases,
    failedCases,
    reports,
    configurationErrors,
  };
}

export function parseGoldenDataset(value: unknown): GoldenDataset {
  if (!value || typeof value !== 'object') throw new Error('golden dataset must be an object');
  const candidate = value as { version?: unknown; cases?: unknown };
  if (!goldenHasExactKeys(value as Record<string, unknown>, ['version', 'cases']))
    throw new Error('golden dataset has unknown fields');
  if (typeof candidate.version !== 'string' || candidate.version.trim().length === 0)
    throw new Error('golden dataset version is required');
  if (!Array.isArray(candidate.cases) || candidate.cases.length === 0)
    throw new Error('golden dataset cases are required');
  const cases = candidate.cases.map((entry, index): GoldenDatasetCase => {
    if (!entry || typeof entry !== 'object') throw new Error(`golden case ${index} is invalid`);
    const row = entry as Record<string, unknown>;
    const input = row['input'] as Record<string, unknown> | undefined;
    const expectation = row['expectation'] as Record<string, unknown> | undefined;
    if (
      typeof row['id'] !== 'string' ||
      typeof row['category'] !== 'string' ||
      !input ||
      !expectation
    )
      throw new Error(`golden case ${index} identity is invalid`);
    if (!goldenHasExactKeys(row, ['id', 'category', 'input', 'expectation']))
      throw new Error(`golden case ${row['id']} has unknown fields`);
    if (
      !goldenHasExactKeys(input, [
        'query',
        'language',
        'country',
        'publishedAfter',
        'maximumResults',
      ])
    )
      throw new Error(`golden case ${row['id']} input has unknown fields`);
    if (
      !goldenHasExactKeys(expectation, [
        'outcome',
        'failureCategory',
        'allowedDataClasses',
        'allowedTools',
        'forbiddenFragments',
        'maximumCostUsdMicros',
        'maximumLatencyMs',
        'maximumRetries',
      ])
    )
      throw new Error(`golden case ${row['id']} expectation has unknown fields`);
    const publishedAfter = new Date(String(input['publishedAfter']));
    const maximumResults = input['maximumResults'];
    if (
      typeof input['query'] !== 'string' ||
      typeof input['language'] !== 'string' ||
      typeof input['country'] !== 'string' ||
      Number.isNaN(publishedAfter.valueOf()) ||
      typeof maximumResults !== 'number' ||
      !Number.isInteger(maximumResults) ||
      maximumResults < 1 ||
      maximumResults > 10
    )
      throw new Error(`golden case ${row['id']} input is invalid`);
    const outcome = expectation['outcome'];
    const failureCategory = expectation['failureCategory'];
    const allowedDataClasses = expectation['allowedDataClasses'];
    const allowedTools = expectation['allowedTools'];
    const forbiddenFragments = expectation['forbiddenFragments'];
    if (
      !GOLDEN_EVALUATION_OUTCOMES.includes(outcome as GoldenEvaluationOutcome) ||
      !(
        failureCategory === null ||
        (typeof failureCategory === 'string' &&
          [
            'AUTHENTICATION',
            'RATE_LIMIT',
            'QUOTA',
            'TIMEOUT_OR_NETWORK',
            'PROVIDER_ERROR',
            'INVALID_RESPONSE',
          ].includes(failureCategory))
      ) ||
      !Array.isArray(allowedDataClasses) ||
      !allowedDataClasses.every((item) => GOLDEN_DATA_CLASSES.includes(item as GoldenDataClass)) ||
      !Array.isArray(allowedTools) ||
      !allowedTools.every((item) => GOLDEN_ALLOWED_TOOLS.includes(item as GoldenAllowedTool)) ||
      !Array.isArray(forbiddenFragments) ||
      !forbiddenFragments.every((item) => typeof item === 'string')
    )
      throw new Error(`golden case ${row['id']} expectation is invalid`);
    for (const field of ['maximumCostUsdMicros', 'maximumLatencyMs', 'maximumRetries'] as const) {
      if (typeof expectation[field] !== 'number' || expectation[field] < 0)
        throw new Error(`golden case ${row['id']} ${field} is invalid`);
    }
    return {
      id: row['id'],
      category: row['category'],
      input: {
        query: input['query'],
        language: input['language'],
        country: input['country'],
        publishedAfter,
        maximumResults,
      },
      expectation: {
        outcome: outcome as GoldenEvaluationOutcome,
        failureCategory: failureCategory as TrendSearchFailureCategory | null,
        allowedDataClasses: allowedDataClasses as GoldenDataClass[],
        allowedTools: allowedTools as GoldenAllowedTool[],
        forbiddenFragments,
        maximumCostUsdMicros: expectation['maximumCostUsdMicros'] as number,
        maximumLatencyMs: expectation['maximumLatencyMs'] as number,
        maximumRetries: expectation['maximumRetries'] as number,
      },
    };
  });
  if (new Set(cases.map((item) => item.id)).size !== cases.length)
    throw new Error('golden dataset case ids must be unique');
  return { version: candidate.version.trim(), cases };
}
