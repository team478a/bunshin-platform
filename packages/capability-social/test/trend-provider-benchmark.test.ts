import { describe, expect, it, vi } from 'vitest';
import {
  evaluateTrendProviderBenchmark,
  formatTrendProviderBenchmarkMarkdown,
  type TrendProviderBenchmarkObservation,
} from '../src/index';

const observation = (
  providerKey: string,
  caseId: string,
  overrides: Partial<TrendProviderBenchmarkObservation> = {},
): TrendProviderBenchmarkObservation => ({
  providerKey,
  caseId,
  query: {
    query: '日本の短尺動画で増えている企画',
    language: 'ja',
    country: 'JP',
    publishedAfter: new Date('2026-08-20T00:00:00.000Z'),
    maximumResults: 2,
  },
  result: {
    providerKey,
    items: [
      {
        url: `https://example.com/${providerKey}/${caseId}`,
        title: '観測できた話題',
        publishedAt: new Date('2026-08-22T00:00:00.000Z'),
        highlights: ['同じ形式の投稿が増えている'],
      },
      {
        url: `https://example.jp/${providerKey}/${caseId}`,
        title: '別の根拠',
        publishedAt: new Date('2026-08-23T00:00:00.000Z'),
        highlights: ['複数の投稿で確認'],
      },
    ],
    creditsUsed: 1,
    latencyMs: 800,
  },
  costUsdMicros: 2_000,
  relevanceRating: 5,
  sourceQualityRating: 5,
  failed: false,
  ...overrides,
});

describe('trend provider benchmark', () => {
  it('同じケースをProvider別に評価し、明確な単独候補だけを提示する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T00:00:00.000Z'));
    const report = evaluateTrendProviderBenchmark(
      [
        observation('GROK_X_SEARCH', 'x-topic'),
        observation('GROK_X_SEARCH', 'cross-web'),
        observation('EXA', 'x-topic', {
          relevanceRating: 2,
          sourceQualityRating: 3,
          result: null,
          failed: true,
        }),
        observation('EXA', 'cross-web', { relevanceRating: 3, sourceQualityRating: 3 }),
      ],
      ['x-topic', 'cross-web'],
    );
    expect(report.recommendation).toBe('GROK_X_SEARCH');
    expect(report.scores[0]).toMatchObject({
      providerKey: 'GROK_X_SEARCH',
      successfulCases: 2,
      eligibleForReview: true,
    });
    vi.useRealTimers();
  });

  it('ケース不足や失敗があるProviderを採用候補にしない', () => {
    const report = evaluateTrendProviderBenchmark(
      [
        observation('GROK_X_SEARCH', 'x-topic'),
        observation('EXA', 'x-topic'),
        observation('EXA', 'cross-web'),
      ],
      ['x-topic', 'cross-web'],
    );
    expect(report.scores.find((item) => item.providerKey === 'GROK_X_SEARCH')).toMatchObject({
      eligibleForReview: false,
    });
    expect(report.recommendation).toBe('EXA');
  });

  it('複数Providerが基準を満たす場合は人間レビューを要求する', () => {
    const report = evaluateTrendProviderBenchmark(
      [observation('GROK_X_SEARCH', 'x-topic'), observation('EXA', 'x-topic')],
      ['x-topic'],
    );
    expect(report.recommendation).toBeNull();
    expect(formatTrendProviderBenchmarkMarkdown(report)).toContain(
      'なし（人間レビューまたは追加比較が必要）',
    );
  });

  it('同額なら費用効率を落とさず、重複URLを根拠件数に数えない', () => {
    const duplicated = observation('EXA', 'case');
    duplicated.result!.items[1]!.url = duplicated.result!.items[0]!.url;
    const report = evaluateTrendProviderBenchmark([duplicated], ['case']);
    expect(report.scores[0]?.metrics).toMatchObject({ costEfficiency: 100, coverage: 50 });
  });

  it('採点範囲外と同一Provider・ケースの重複を拒否する', () => {
    expect(() =>
      evaluateTrendProviderBenchmark(
        [observation('EXA', 'case', { relevanceRating: 6 })],
        ['case'],
      ),
    ).toThrow('ratings');
    expect(() =>
      evaluateTrendProviderBenchmark(
        [observation('EXA', 'case'), observation('EXA', 'case')],
        ['case'],
      ),
    ).toThrow('duplicate');
    expect(() =>
      evaluateTrendProviderBenchmark([observation('EXA', 'unknown')], ['known']),
    ).toThrow('unknown');
  });
});
