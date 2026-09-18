import { describe, expect, it } from 'vitest';
import {
  buildPostPerformanceInsight,
  buildPostPerformancePlanningContext,
  readPostPerformance,
  writePostPerformance,
  type PostPerformanceView,
} from '../src/services/post-performance';

const item = (overrides: Partial<PostPerformanceView> = {}): PostPerformanceView => ({
  dailyMissionId: crypto.randomUUID(),
  topic: '季節のおすすめ',
  postedAt: '2026-09-15T03:00:00.000Z',
  observedOn: '2026-09-16',
  source: 'SCREENSHOT',
  reach: 100,
  impressions: 120,
  likes: 5,
  comments: 1,
  saves: 2,
  shares: 0,
  profileViews: 3,
  follows: 1,
  ...overrides,
});

describe('post performance feedback', () => {
  it('preserves other manual metrics when it stores screenshot results', () => {
    const stored = writePostPerformance({ businessOutcomes: { inquiries: 2 } }, item());
    expect(stored.businessOutcomes).toEqual({ inquiries: 2 });
    expect(readPostPerformance(stored)).toMatchObject({ saves: 2, follows: 1 });
  });

  it('waits for three posts before it reports a trend', () => {
    expect(buildPostPerformanceInsight([item(), item()]).title).toContain('あと1件');
  });

  it('ranks saved and shared posts for the next planning cycle', () => {
    const strong = item({ topic: '保存版チェックリスト', saves: 10, shares: 4 });
    const context = buildPostPerformancePlanningContext([
      item({ topic: '日常投稿', saves: 0 }),
      strong,
      item({ topic: '質問投稿', comments: 3 }),
    ]);
    expect(context.recordedCount).toBe(3);
    expect(context.strongTopics[0]?.topic).toBe('保存版チェックリスト');
    expect(buildPostPerformanceInsight([strong, item(), item()]).title).toContain('保存・共有');
  });
});
