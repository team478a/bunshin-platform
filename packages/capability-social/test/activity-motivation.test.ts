import { describe, expect, it } from 'vitest';
import {
  EvaluateActivityMotivation,
  type AchievementBadge,
  type AchievementBadgeRepository,
  type MissionProgress,
} from '../src';
import { DEFAULT_ACTIVITY_CONTINUITY_RULE } from '@bunshin/application';

class Badges implements AchievementBadgeRepository {
  values: AchievementBadge[] = [];
  list(input: { workspaceId: string; userId: string; bunshinId: string; featureKey: string }) {
    return Promise.resolve(
      this.values.filter(
        (value) =>
          value.workspaceId === input.workspaceId &&
          value.userId === input.userId &&
          value.bunshinId === input.bunshinId &&
          value.featureKey === input.featureKey,
      ),
    );
  }
  award(input: Omit<AchievementBadge, 'id' | 'awardedAt'>) {
    const existing = this.values.find(
      (value) =>
        value.workspaceId === input.workspaceId &&
        value.userId === input.userId &&
        value.bunshinId === input.bunshinId &&
        value.featureKey === input.featureKey &&
        value.badgeKey === input.badgeKey &&
        value.ruleVersion === input.ruleVersion,
    );
    if (existing) return Promise.resolve(existing);
    const value = { ...input, id: `badge-${this.values.length + 1}`, awardedAt: new Date() };
    this.values.push(value);
    return Promise.resolve(value);
  }
}

function progress(overrides: Partial<MissionProgress['cumulative']> = {}): MissionProgress {
  return {
    weekStart: '2026-08-24',
    weekEnd: '2026-08-30',
    weeklyGoal: 3,
    remainingConfirmations: 2,
    weekly: { confirmedDays: 1, preparedDays: 0, postedDays: 0, restedDays: 0, days: [] },
    cumulative: {
      confirmedDays: 1,
      preparedDays: 0,
      postedDays: 0,
      restedDays: 0,
      activeDays: 1,
      lastActiveDate: '2026-08-20',
      ...overrides,
    },
  };
}

describe('EvaluateActivityMotivation', () => {
  it('条件を満たしたバッジを一度だけ付与する', async () => {
    const badges = new Badges();
    const useCase = new EvaluateActivityMotivation(badges);
    const input = {
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      bunshinId: 'bunshin-1',
      localDate: '2026-08-27',
      progress: progress({ activeDays: 3 }),
    };
    const first = await useCase.execute(input);
    const second = await useCase.execute(input);
    expect(first.badges.map(({ badgeKey }) => badgeKey)).toEqual([
      'FIRST_CONFIRMATION',
      'THREE_ACTIVE_DAYS',
    ]);
    expect(second.badges).toHaveLength(2);
    expect(badges.values).toHaveLength(2);
  });

  it('7日活動がない場合も段階を下げず、やさしい復帰案内を返す', async () => {
    const result = await new EvaluateActivityMotivation(new Badges()).execute({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      bunshinId: 'bunshin-1',
      localDate: '2026-08-27',
      progress: progress({ activeDays: 8, lastActiveDate: '2026-08-20' }),
    });
    expect(result.step).toBe('CONTINUING');
    expect(result.dormant).toBe(true);
    expect(result.returnMessage).toContain('見るだけでも大丈夫');
  });

  it('使用中の版の段階・休眠・バッジ条件を使う', async () => {
    const badges = new Badges();
    const rule = {
      ...DEFAULT_ACTIVITY_CONTINUITY_RULE,
      version: 2,
      dormancyDays: 10,
      stepBuildingDays: 5,
      stepContinuingDays: 10,
      stepEstablishedDays: 20,
      badges: DEFAULT_ACTIVITY_CONTINUITY_RULE.badges.map((badge) => ({
        ...badge,
        threshold: badge.badgeKey === 'THREE_ACTIVE_DAYS' ? 5 : badge.threshold,
      })),
    };
    const result = await new EvaluateActivityMotivation(badges).execute({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      bunshinId: 'bunshin-1',
      localDate: '2026-08-29',
      progress: progress({ activeDays: 5, lastActiveDate: '2026-08-20' }),
      rule,
    });
    expect(result.step).toBe('BUILDING');
    expect(result.dormant).toBe(false);
    expect(result.badges.find((badge) => badge.badgeKey === 'THREE_ACTIVE_DAYS')?.ruleVersion).toBe(
      2,
    );
  });
});
