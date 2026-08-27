import { ApplicationError } from '@bunshin/shared';

export type ActivityBadgeMetric = 'confirmedDays' | 'preparedDays' | 'postedDays' | 'activeDays';
export interface ActivityBadgeRule {
  badgeKey: string;
  label: string;
  description: string;
  metric: ActivityBadgeMetric;
  threshold: number;
}
export interface ActivityContinuityRule {
  id: string;
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';
  weeklyGoal: number;
  dormancyDays: number;
  stepBuildingDays: number;
  stepContinuingDays: number;
  stepEstablishedDays: number;
  badges: ActivityBadgeRule[];
  changeReason: string;
  activationReason: string | null;
  createdAt: Date;
  activatedAt: Date | null;
}
export interface ActivityContinuityRuleRepository {
  list(input: {
    actorUserId: string;
    environment: ActivityContinuityRule['environment'];
  }): Promise<ActivityContinuityRule[] | null>;
  active(
    environment: ActivityContinuityRule['environment'],
  ): Promise<ActivityContinuityRule | null>;
  create(
    input: Omit<
      ActivityContinuityRule,
      'id' | 'version' | 'status' | 'createdAt' | 'activatedAt' | 'activationReason'
    > & { actorUserId: string },
  ): Promise<ActivityContinuityRule | null>;
  activate(input: {
    actorUserId: string;
    ruleId: string;
    environment: ActivityContinuityRule['environment'];
    reason: string;
  }): Promise<ActivityContinuityRule | null>;
}

export const DEFAULT_ACTIVITY_CONTINUITY_RULE = {
  id: 'built-in-v1',
  environment: 'PRODUCTION',
  version: 1,
  status: 'ACTIVE',
  weeklyGoal: 3,
  dormancyDays: 7,
  stepBuildingDays: 3,
  stepContinuingDays: 7,
  stepEstablishedDays: 15,
  badges: [
    {
      badgeKey: 'FIRST_CONFIRMATION',
      label: 'はじめて確認',
      description: '投稿案をはじめて確認しました',
      metric: 'confirmedDays',
      threshold: 1,
    },
    {
      badgeKey: 'FIRST_PREPARATION',
      label: 'はじめて準備',
      description: '投稿の準備をはじめて行いました',
      metric: 'preparedDays',
      threshold: 1,
    },
    {
      badgeKey: 'FIRST_POST',
      label: 'はじめて投稿',
      description: '投稿完了をはじめて記録しました',
      metric: 'postedDays',
      threshold: 1,
    },
    {
      badgeKey: 'THREE_ACTIVE_DAYS',
      label: '3日活動',
      description: '3日間、発信に向けて活動しました',
      metric: 'activeDays',
      threshold: 3,
    },
  ] satisfies ActivityBadgeRule[],
  changeReason: '組み込み初期ルール',
  activationReason: '組み込み初期ルール',
  createdAt: new Date(0),
  activatedAt: new Date(0),
} satisfies ActivityContinuityRule;

function validate(input: {
  weeklyGoal: number;
  dormancyDays: number;
  stepBuildingDays: number;
  stepContinuingDays: number;
  stepEstablishedDays: number;
  badges: ActivityBadgeRule[];
  changeReason: string;
}) {
  if (!Number.isInteger(input.weeklyGoal) || input.weeklyGoal < 1 || input.weeklyGoal > 7)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid weekly goal');
  if (!Number.isInteger(input.dormancyDays) || input.dormancyDays < 1 || input.dormancyDays > 90)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid dormancy days');
  if (!(
    input.stepBuildingDays > 0 &&
    input.stepContinuingDays > input.stepBuildingDays &&
    input.stepEstablishedDays > input.stepContinuingDays
  ))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid step thresholds');
  if (input.changeReason.trim().length < 5 || input.changeReason.length > 1000)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid change reason');
  if (
    input.badges.length < 1 ||
    input.badges.length > 20 ||
    new Set(input.badges.map((badge) => badge.badgeKey)).size !== input.badges.length
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid badge rules');
}

export class ListActivityContinuityRules {
  constructor(private readonly repository: ActivityContinuityRuleRepository) {}
  async execute(actorUserId: string, environment: ActivityContinuityRule['environment']) {
    const rules = await this.repository.list({ actorUserId, environment });
    if (!rules) throw new ApplicationError('NOT_FOUND', 'activity rules not found');
    return rules;
  }
}
export class CreateActivityContinuityRule {
  constructor(private readonly repository: ActivityContinuityRuleRepository) {}
  async execute(input: Parameters<ActivityContinuityRuleRepository['create']>[0]) {
    validate(input);
    const rule = await this.repository.create({
      ...input,
      changeReason: input.changeReason.trim(),
    });
    if (!rule) throw new ApplicationError('NOT_FOUND', 'activity rule not created');
    return rule;
  }
}
export class ActivateActivityContinuityRule {
  constructor(private readonly repository: ActivityContinuityRuleRepository) {}
  async execute(input: Parameters<ActivityContinuityRuleRepository['activate']>[0]) {
    if (!/^[0-9a-f-]{36}$/i.test(input.ruleId) || input.reason.trim().length < 5)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid activation');
    const rule = await this.repository.activate({ ...input, reason: input.reason.trim() });
    if (!rule) throw new ApplicationError('NOT_FOUND', 'activity rule not found');
    return rule;
  }
}
