import { describe, expect, it } from 'vitest';
import { summarizeMissionLearningHistory } from '../src/services/daily-mission-learning-history';

const mission = (missionDate: string, topic: string, angle = '具体的な切り口') => ({
  missionDate: new Date(`${missionDate}T00:00:00.000Z`),
  topic,
  angle,
});

describe('daily mission learning history', () => {
  it('turns explicit feedback, rejection reasons and selected alternatives into grounded guidance', () => {
    const result = summarizeMissionLearningHistory({
      activities: [
        {
          type: 'POSTED',
          occurredAt: new Date('2026-09-20T03:00:00.000Z'),
          dailyMission: mission('2026-09-20', '城跡で最初に見る場所'),
        },
      ],
      variants: [
        {
          selectedAt: new Date('2026-09-20T02:00:00.000Z'),
          variant: { sequence: 2 },
          dailyMission: mission('2026-09-20', '城跡で最初に見る場所'),
        },
      ],
      feedback: [
        {
          rating: 'GOOD',
          updatedAt: new Date('2026-09-20T04:00:00.000Z'),
          dailyMission: mission('2026-09-20', '城跡で最初に見る場所'),
        },
      ],
      decisions: [
        {
          decision: 'REJECTED',
          rejectionReason: 'TOO_SALESY',
          rejectionDetail: null,
          decidedAt: new Date('2026-09-21T02:00:00.000Z'),
          dailyMission: mission('2026-09-21', 'ORIの申込み案内'),
        },
      ],
      posts: [],
      socialInsights: [],
    });

    expect(result.feedbackSummary).toContain('良かった');
    expect(result.feedbackSummary).toContain('売り込みが強い');
    expect(result.feedbackSummary).toContain('同じ原稿や単なる言い換えは再利用しない');
    expect(result.behaviorSummary).toContain('別案2を選択');
    expect(result.feedbackSummary).toContain('1件だけでは傾向と断定しない');
    expect(result.fallbackPreference).toBe('STANDARD');
  });

  it('changes fallback only after the same concern is observed multiple times', () => {
    const rejection = (date: string) => ({
      decision: 'REJECTED' as const,
      rejectionReason: 'TOO_SALESY' as const,
      rejectionDetail: null,
      decidedAt: new Date(`${date}T02:00:00.000Z`),
      dailyMission: mission(date, '申込み案内'),
    });
    const result = summarizeMissionLearningHistory({
      activities: [],
      variants: [],
      feedback: [],
      decisions: [rejection('2026-09-20'), rejection('2026-09-19')],
      posts: [],
      socialInsights: [],
    });
    expect(result.fallbackPreference).toBe('SOFT_CTA');
    expect(result.feedbackSummary).toContain('売り込みが強いが2回');
  });

  it('connects per-post performance to its topic without inventing conclusions', () => {
    const result = summarizeMissionLearningHistory({
      activities: [],
      variants: [],
      feedback: [],
      decisions: [],
      posts: [
        {
          postedAt: new Date('2026-09-20T03:00:00.000Z'),
          dailyMission: mission('2026-09-20', 'ORIでできること'),
          manualMetrics: {
            socialPerformance: {
              observedOn: '2026-09-21',
              source: 'SCREENSHOT',
              reach: 120,
              impressions: 180,
              likes: 12,
              comments: 2,
              saves: 5,
              shares: 1,
              profileViews: 8,
              follows: 3,
            },
          },
        },
      ],
      socialInsights: [],
    });

    expect(result.performanceSummary).toContain('ORIでできること');
    expect(result.performanceSummary).toContain('保存5');
    expect(result.performanceSummary).toContain('別の疑問・具体例');
    expect(result.performanceSummary).toContain('一件だけで効果を断定しない');
  });
});
