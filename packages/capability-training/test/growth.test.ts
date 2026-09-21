import { describe, expect, it } from 'vitest';
import { buildTrainingGrowthSummary } from '../src/growth';

describe('AI training growth summary', () => {
  it('shows mastered, strongest and focus skills from the existing projection', () => {
    const summary = buildTrainingGrowthSummary({
      completedMissionCount: 7,
      streak: 4,
      skillScores: { promptStructure: 84, constraintSetting: 45, businessApplication: 72 },
      activityDates: [
        new Date('2026-09-19T15:30:00.000Z'),
        new Date('2026-09-21T01:00:00.000Z'),
        new Date('2026-09-21T03:00:00.000Z'),
      ],
      completedMissionTitles: ['AIへ目的を伝える', '営業メールを作る'],
      now: new Date('2026-09-21T12:00:00.000Z'),
    });

    expect(summary.level).toBe(3);
    expect(summary.masteredSkillCount).toBe(2);
    expect(summary.strongestSkill?.key).toBe('promptStructure');
    expect(summary.focusSkill?.key).toBe('constraintSetting');
    expect(summary.weeklyLearningDays).toBe(2);
    expect(summary.achievements).toEqual(['営業メールを作る', 'AIへ目的を伝える']);
  });

  it('has a useful empty state before the first evaluation', () => {
    const summary = buildTrainingGrowthSummary({
      completedMissionCount: 0,
      streak: 0,
      skillScores: {},
      activityDates: [],
      completedMissionTitles: [],
      now: new Date('2026-09-21T12:00:00.000Z'),
    });

    expect(summary.level).toBe(1);
    expect(summary.strongestSkill).toBeNull();
    expect(summary.focusSkill).toBeNull();
    expect(summary.skills.every(({ status }) => status === 'NOT_STARTED')).toBe(true);
  });
});
