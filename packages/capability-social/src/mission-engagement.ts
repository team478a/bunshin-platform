import {
  DEFAULT_ACTIVITY_CONTINUITY_RULE,
  RequireActiveBunshinCapability,
  type ActivityContinuityRule,
  type BunshinCapabilityAssignmentRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

import { DailyMissionMutation } from './daily-mission-authorization';
import type { DailyMissionRepository, DailyMissionScope } from './daily-mission-runtime';
import { missionInteger, strict } from './mission-content';
import { missionIdempotencyKey } from './mission-engagement-validation';
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
      idempotencyKey: missionIdempotencyKey(input.idempotencyKey),
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
      idempotencyKey: missionIdempotencyKey(input.idempotencyKey),
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
