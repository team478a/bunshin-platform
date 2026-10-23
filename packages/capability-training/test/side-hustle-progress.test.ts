import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import {
  SIDE_HUSTLE_STAGE_ADVANCE_MIN_DAYS,
  SIDE_HUSTLE_STAGE_ADVANCE_PRACTICE_THRESHOLD,
  buildSideHustleStageRequest,
  sideHustleCheckinEligibility,
  sideHustleProgressGuidance,
  validateSideHustleCheckin,
} from '../src/side-hustle-progress';
import type { SideHustleRoadmapProposal } from '../src/side-hustle-roadmap';

const roadmap = {
  reason: 'test',
  milestones: [
    {
      period: 'MONTH_1',
      title: '1月目',
      outcome: '目標',
      checkpoints: ['A'.repeat(40), 'B'],
      weeklyHours: 2,
    },
    {
      period: 'MONTH_2',
      title: '2月目',
      outcome: '目標',
      checkpoints: ['A'.repeat(40), 'B'],
      weeklyHours: 2,
    },
    {
      period: 'MONTH_3',
      title: '3月目',
      outcome: '目標',
      checkpoints: ['A'.repeat(40), 'B'],
      weeklyHours: 2,
    },
  ],
} as const;
const base = {
  topicId: '123e4567-e89b-42d3-a456-426614174000',
  period: 'MONTH_1',
  checkpointResults: ['PARTLY', 'DONE'],
  feeling: 'OK',
  note: null,
  decision: 'ADVANCE',
};

describe('side hustle progress', () => {
  it('keeps the fixed suggestion thresholds', () => {
    expect(SIDE_HUSTLE_STAGE_ADVANCE_PRACTICE_THRESHOLD).toBe(2);
    expect(SIDE_HUSTLE_STAGE_ADVANCE_MIN_DAYS).toBe(28);
    const start = new Date('2026-01-01T00:00:00Z');
    expect(
      sideHustleCheckinEligibility({
        period: 'MONTH_1',
        periodStartedAt: start,
        verifiedPracticeCount: 0,
        now: '2026-01-28T00:00:00Z',
      }).suggested,
    ).toBe(false);
    expect(
      sideHustleCheckinEligibility({
        period: 'MONTH_1',
        periodStartedAt: start,
        verifiedPracticeCount: 0,
        now: '2026-01-29T00:00:00Z',
      }).suggested,
    ).toBe(true);
    expect(
      sideHustleCheckinEligibility({
        period: 'MONTH_1',
        periodStartedAt: start,
        verifiedPracticeCount: 1,
        now: '2026-01-27T23:59:59Z',
      }).suggested,
    ).toBe(false);
    expect(
      sideHustleCheckinEligibility({
        period: 'MONTH_1',
        periodStartedAt: start,
        verifiedPracticeCount: 2,
        now: '2026-01-02T00:00:00Z',
      }),
    ).toMatchObject({ suggested: true, canAdvance: true, reason: 'ENOUGH_PRACTICE' });
    expect(
      sideHustleCheckinEligibility({
        period: 'MONTH_1',
        periodStartedAt: start,
        verifiedPracticeCount: 0,
        now: '2026-01-02T00:00:00Z',
      }).canAdvance,
    ).toBe(false);
  });

  it('strictly validates checkin and safety-scans notes', () => {
    expect(validateSideHustleCheckin(base, 2)).toEqual(base);
    expect(() => validateSideHustleCheckin({ ...base, extra: true }, 2)).toThrow(ApplicationError);
    expect(() => validateSideHustleCheckin({ ...base, checkpointResults: ['DONE'] }, 2)).toThrow(
      ApplicationError,
    );
    expect(() => validateSideHustleCheckin({ ...base, note: ' 投資の助言' }, 2)).toThrow(
      ApplicationError,
    );
    expect(() => validateSideHustleCheckin({ ...base, note: '気づき ' }, 2)).toThrow(
      ApplicationError,
    );
    expect(() => validateSideHustleCheckin({ ...base, note: ' 気づき' }, 2)).toThrow(
      ApplicationError,
    );
    expect(() => validateSideHustleCheckin({ ...base, note: '絶対に稼げます' }, 2)).toThrow(
      ApplicationError,
    );
    expect(() => validateSideHustleCheckin({ ...base, note: 'パチスロで稼ぐ' }, 2)).toThrow(
      ApplicationError,
    );
    expect(() => validateSideHustleCheckin({ ...base, note: 'x'.repeat(201) }, 2)).toThrow(
      ApplicationError,
    );
  });

  it('uses the Appendix B-1 guidance for each eligibility reason', () => {
    expect(sideHustleProgressGuidance('MONTH_2', 'ENOUGH_PRACTICE')).toBe(
      '2か月目の実践が進んでいます。ここまでを振り返ってみませんか？',
    );
    expect(sideHustleProgressGuidance('MONTH_2', 'TIME_PASSED')).toBe(
      '2か月目を始めて4週間たちました。いまの進み具合を一緒に確認しましょう。',
    );
    expect(sideHustleProgressGuidance('MONTH_2', 'NOT_YET')).toBeNull();
  });

  it('changes only the current-stage line and carries unfinished checkpoints within the limit', () => {
    const result = buildSideHustleStageRequest({
      previous: {
        originalText: '希望\nいまの段階：1か月目「1月目」',
        deviceType: 'PC',
        toolDescription: 'tool',
        experienceDescription: null,
        currentPosition: 'old',
      },
      roadmap,
      toPeriod: 'MONTH_2',
      checkpointResults: ['PARTLY', 'NOT_YET'],
    });
    expect(result.originalText).toBe(
      `希望\nいまの段階：2か月目「2月目」\nいまの段階の目安：${['A'.repeat(40), 'B'].join('／')}（前の月で残ったこと：${['A'.repeat(40), 'B'].join('／')}）`,
    );
    expect(result.currentPosition).toContain('前の月で残ったこと');
    expect(result.deviceType).toBe('PC');
    const replacement = buildSideHustleStageRequest({
      previous: {
        originalText: '希望\nいまの段階：1か月目「1月目」\nいまの段階の目安：古い目安',
        deviceType: null,
        toolDescription: null,
        experienceDescription: null,
        currentPosition: null,
      },
      roadmap,
      toPeriod: 'MONTH_2',
      checkpointResults: ['DONE', 'DONE'],
    });
    expect(replacement.originalText).toContain(
      `いまの段階の目安：${roadmap.milestones[1].checkpoints.join('／')}`,
    );
    expect(replacement.originalText).not.toContain('古い目安');
    expect(() =>
      buildSideHustleStageRequest({
        previous: {
          originalText: 'いまの段階：1か月目\nいまの段階：重複',
          deviceType: null,
          toolDescription: null,
          experienceDescription: null,
          currentPosition: null,
        },
        roadmap,
        toPeriod: 'MONTH_2',
        checkpointResults: [],
      }),
    ).toThrow(ApplicationError);
    expect(() =>
      buildSideHustleStageRequest({
        previous: {
          originalText: 'いまの段階：1か月目\nいまの段階の目安：A\nいまの段階の目安：B',
          deviceType: null,
          toolDescription: null,
          experienceDescription: null,
          currentPosition: null,
        },
        roadmap,
        toPeriod: 'MONTH_2',
        checkpointResults: [],
      }),
    ).toThrow(ApplicationError);
    const longRoadmap = {
      ...roadmap,
      milestones: roadmap.milestones.map((milestone) => ({
        ...milestone,
        checkpoints: ['A'.repeat(80), 'B'.repeat(80), 'C'.repeat(80)],
      })),
    } as unknown as SideHustleRoadmapProposal;
    const bounded = buildSideHustleStageRequest({
      previous: {
        originalText: 'いまの段階：1か月目',
        deviceType: null,
        toolDescription: null,
        experienceDescription: null,
        currentPosition: null,
      },
      roadmap: longRoadmap,
      toPeriod: 'MONTH_2',
      checkpointResults: ['NOT_YET', 'PARTLY', 'NOT_YET'],
    });
    expect(bounded.currentPosition?.length).toBeLessThanOrEqual(500);
    expect(bounded.currentPosition).toContain(
      `（前の月で残ったこと：${['B'.repeat(80), 'C'.repeat(80)].join('／')}）`,
    );
    expect(() =>
      buildSideHustleStageRequest({
        previous: {
          originalText: 'none',
          deviceType: null,
          toolDescription: null,
          experienceDescription: null,
          currentPosition: null,
        },
        roadmap,
        toPeriod: 'MONTH_2',
        checkpointResults: [],
      }),
    ).toThrow(ApplicationError);
  });
});
