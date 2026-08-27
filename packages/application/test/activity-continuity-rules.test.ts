import { describe, expect, it } from 'vitest';
import {
  ActivateActivityContinuityRule,
  CreateActivityContinuityRule,
  DEFAULT_ACTIVITY_CONTINUITY_RULE,
  type ActivityContinuityRule,
  type ActivityContinuityRuleRepository,
} from '../src';

class Rules implements ActivityContinuityRuleRepository {
  created: Parameters<ActivityContinuityRuleRepository['create']>[0] | null = null;
  activated: Parameters<ActivityContinuityRuleRepository['activate']>[0] | null = null;

  list() {
    return Promise.resolve([]);
  }

  active() {
    return Promise.resolve(null);
  }

  create(input: Parameters<ActivityContinuityRuleRepository['create']>[0]) {
    this.created = input;
    return Promise.resolve({
      ...DEFAULT_ACTIVITY_CONTINUITY_RULE,
      ...input,
      id: '11111111-1111-4111-8111-111111111111',
      version: 2,
      status: 'DRAFT' as const,
      activationReason: null,
      createdAt: new Date(),
      activatedAt: null,
    });
  }

  activate(input: Parameters<ActivityContinuityRuleRepository['activate']>[0]) {
    this.activated = input;
    return Promise.resolve({
      ...DEFAULT_ACTIVITY_CONTINUITY_RULE,
      id: input.ruleId,
      environment: input.environment,
      version: 2,
      activationReason: input.reason,
    } satisfies ActivityContinuityRule);
  }
}

describe('ActivityContinuityRule', () => {
  it('数値の順序と作成理由を検証して下書きを保存する', async () => {
    const repository = new Rules();
    await new CreateActivityContinuityRule(repository).execute({
      actorUserId: 'user-1',
      environment: 'PRODUCTION',
      weeklyGoal: 4,
      dormancyDays: 10,
      stepBuildingDays: 4,
      stepContinuingDays: 8,
      stepEstablishedDays: 20,
      badges: DEFAULT_ACTIVITY_CONTINUITY_RULE.badges,
      changeReason: '  運用結果を反映  ',
    });
    expect(repository.created?.changeReason).toBe('運用結果を反映');
    expect(repository.created?.weeklyGoal).toBe(4);
  });

  it('使用開始理由を整形して渡す', async () => {
    const repository = new Rules();
    await new ActivateActivityContinuityRule(repository).execute({
      actorUserId: 'user-1',
      environment: 'PRODUCTION',
      ruleId: '11111111-1111-4111-8111-111111111111',
      reason: '  確認完了のため開始  ',
    });
    expect(repository.activated?.reason).toBe('確認完了のため開始');
  });
});
