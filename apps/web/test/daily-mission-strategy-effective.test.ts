import type { SocialAccountStrategy } from '@bunshin/capability-social';
import { describe, expect, it } from 'vitest';
import { strategyForWeeklyPlan } from '../src/services/daily-mission-planning-context';

const now = new Date('2026-10-01T00:00:00.000Z');

function strategy(
  id: string,
  goal: SocialAccountStrategy['goal'],
  status: SocialAccountStrategy['status'],
): SocialAccountStrategy {
  return {
    id,
    workspaceId: 'workspace-1',
    bunshinId: 'bunshin-1',
    socialProfileId: 'profile-1',
    platform: 'INSTAGRAM',
    goal,
    availableMinutes: 5,
    destinationType: 'PROFILE',
    destinationDetail: null,
    concept: `${goal}の方針`,
    positioning: '専門家',
    targetSummary: '対象顧客',
    profileDraft: 'プロフィール',
    ctaStrategy: '詳細を見る',
    postingPolicy: '週次',
    version: id === 'old-strategy' ? 1 : 2,
    status,
    approvedAt: now,
    supersededAt: status === 'SUPERSEDED' ? now : null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('weekly plan strategy effective timing', () => {
  const oldStrategy = strategy('old-strategy', 'BRAND_AWARENESS', 'SUPERSEDED');
  const currentStrategy = strategy('current-strategy', 'RECRUIT', 'APPROVED');

  it('keeps a confirmed plan on the strategy that generated it after a goal change', () => {
    expect(
      strategyForWeeklyPlan({ strategyId: oldStrategy.id, strategyGoal: oldStrategy.goal }, [
        currentStrategy,
        oldStrategy,
      ]),
    ).toBe(oldStrategy);
  });

  it('uses the current approved strategy only for legacy plans without a snapshot', () => {
    expect(
      strategyForWeeklyPlan({ strategyId: null, strategyGoal: null }, [
        currentStrategy,
        oldStrategy,
      ]),
    ).toBe(currentStrategy);
  });

  it('stops instead of mixing goals when the saved strategy snapshot is inconsistent', () => {
    expect(() =>
      strategyForWeeklyPlan({ strategyId: oldStrategy.id, strategyGoal: 'RECRUIT' }, [
        currentStrategy,
        oldStrategy,
      ]),
    ).toThrow('weekly plan strategy is unavailable');
  });
});
