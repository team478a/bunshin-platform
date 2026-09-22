export type TrendSearchFailureCategory =
  | 'AUTHENTICATION'
  | 'RATE_LIMIT'
  | 'QUOTA'
  | 'TIMEOUT_OR_NETWORK'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE';
export interface TrendSearchQuery {
  query: string;
  language: string;
  country: string;
  publishedAfter: Date;
  maximumResults: number;
}
export interface TrendSearchResultItem {
  url: string;
  title: string;
  publishedAt: Date | null;
  highlights: string[];
}
export interface TrendSearchResult {
  providerKey: string;
  items: TrendSearchResultItem[];
  creditsUsed: number | null;
  latencyMs: number;
}
export interface TrendResearchProviderPort {
  search(input: TrendSearchQuery): Promise<TrendSearchResult>;
}

export interface TrendProviderBenchmarkObservation {
  caseId: string;
  providerKey: string;
  query: TrendSearchQuery;
  result: TrendSearchResult | null;
  costUsdMicros: number;
  relevanceRating: number;
  sourceQualityRating: number;
  failed: boolean;
}
export interface TrendProviderBenchmarkScore {
  providerKey: string;
  totalCases: number;
  successfulCases: number;
  averageScore: number;
  averageCostUsdMicros: number;
  averageLatencyMs: number;
  metrics: {
    relevance: number;
    sourceQuality: number;
    coverage: number;
    freshness: number;
    reliability: number;
    costEfficiency: number;
  };
  eligibleForReview: boolean;
}
export interface TrendProviderBenchmarkReport {
  generatedAt: Date;
  scores: TrendProviderBenchmarkScore[];
  recommendation: string | null;
}

function benchmarkAverage(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
function benchmarkPercent(value: number) {
  return Math.round(Math.min(Math.max(value, 0), 100) * 100) / 100;
}
function benchmarkSafeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

export function evaluateTrendProviderBenchmark(
  observations: TrendProviderBenchmarkObservation[],
  expectedCaseIds: string[],
): TrendProviderBenchmarkReport {
  if (observations.length === 0) throw new Error('benchmark observations are required');
  const caseIds = new Set(expectedCaseIds.map((item) => item.trim()).filter(Boolean));
  if (caseIds.size === 0 || caseIds.size !== expectedCaseIds.length)
    throw new Error('unique benchmark case ids are required');
  const grouped = new Map<string, TrendProviderBenchmarkObservation[]>();
  for (const observation of observations) {
    if (!observation.caseId.trim() || !observation.providerKey.trim())
      throw new Error('benchmark identity is required');
    if (!caseIds.has(observation.caseId)) throw new Error('unknown benchmark case');
    if (!Number.isSafeInteger(observation.costUsdMicros) || observation.costUsdMicros < 0)
      throw new Error('benchmark cost must be a non-negative integer');
    if (
      !Number.isInteger(observation.relevanceRating) ||
      observation.relevanceRating < 0 ||
      observation.relevanceRating > 5 ||
      !Number.isInteger(observation.sourceQualityRating) ||
      observation.sourceQualityRating < 0 ||
      observation.sourceQualityRating > 5
    )
      throw new Error('benchmark ratings must be integers from 0 to 5');
    const values = grouped.get(observation.providerKey) ?? [];
    if (values.some((item) => item.caseId === observation.caseId))
      throw new Error('duplicate provider benchmark observation');
    values.push(observation);
    grouped.set(observation.providerKey, values);
  }
  const costs = observations.map((item) => item.costUsdMicros);
  const minimumCost = Math.min(...costs);
  const maximumCost = Math.max(...costs);
  const scores = [...grouped.entries()]
    .map(([providerKey, values]): TrendProviderBenchmarkScore => {
      const successful = values.filter((item) => !item.failed && item.result !== null);
      const relevance = benchmarkPercent(
        benchmarkAverage(values.map((item) => item.relevanceRating)) * 20,
      );
      const sourceQuality = benchmarkPercent(
        benchmarkAverage(values.map((item) => item.sourceQualityRating)) * 20,
      );
      const coverage = benchmarkPercent(
        benchmarkAverage(
          values.map((item) => {
            const valid = new Set(
              item.result?.items
                .filter((result) => benchmarkSafeUrl(result.url))
                .map((result) => result.url) ?? [],
            ).size;
            return (valid / Math.max(item.query.maximumResults, 1)) * 100;
          }),
        ),
      );
      const freshness = benchmarkPercent(
        benchmarkAverage(
          values.map((item) => {
            const dated = item.result?.items.filter((result) => result.publishedAt !== null) ?? [];
            if (dated.length === 0) return 0;
            return (
              (dated.filter((result) => result.publishedAt! >= item.query.publishedAfter).length /
                dated.length) *
              100
            );
          }),
        ),
      );
      const reliability = benchmarkPercent((successful.length / values.length) * 100);
      const averageCost = benchmarkAverage(values.map((item) => item.costUsdMicros));
      const costEfficiency = benchmarkPercent(
        maximumCost === minimumCost
          ? 100
          : ((maximumCost - averageCost) / (maximumCost - minimumCost)) * 100,
      );
      const averageScore = benchmarkPercent(
        relevance * 0.3 +
          sourceQuality * 0.25 +
          coverage * 0.15 +
          freshness * 0.15 +
          reliability * 0.1 +
          costEfficiency * 0.05,
      );
      return {
        providerKey,
        totalCases: values.length,
        successfulCases: successful.length,
        averageScore,
        averageCostUsdMicros: Math.round(averageCost),
        averageLatencyMs: Math.round(
          benchmarkAverage(values.map((item) => item.result?.latencyMs ?? 0)),
        ),
        metrics: { relevance, sourceQuality, coverage, freshness, reliability, costEfficiency },
        eligibleForReview:
          values.length === caseIds.size &&
          successful.length === values.length &&
          relevance >= 70 &&
          sourceQuality >= 70 &&
          coverage >= 60,
      };
    })
    .sort((left, right) => right.averageScore - left.averageScore);
  const eligible = scores.filter((item) => item.eligibleForReview);
  return {
    generatedAt: new Date(),
    scores,
    recommendation: eligible.length === 1 ? eligible[0]!.providerKey : null,
  };
}

export function formatTrendProviderBenchmarkMarkdown(report: TrendProviderBenchmarkReport) {
  const rows = report.scores.map(
    (score) =>
      `| ${score.providerKey} | ${score.averageScore.toFixed(2)} | ${score.successfulCases}/${score.totalCases} | ${score.metrics.relevance.toFixed(2)} | ${score.metrics.sourceQuality.toFixed(2)} | ${score.metrics.coverage.toFixed(2)} | ${score.metrics.freshness.toFixed(2)} | $${(score.averageCostUsdMicros / 1_000_000).toFixed(4)} | ${score.averageLatencyMs}ms | ${score.eligibleForReview ? '候補' : '要改善'} |`,
  );
  return [
    '# トレンド調査Provider比較結果',
    '',
    '| Provider | 総合点 | 成功 | 関連性 | 出典品質 | 根拠充足 | 鮮度確認 | 平均原価 | 平均時間 | 判定 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows,
    '',
    `単独推奨: ${report.recommendation ?? 'なし（人間レビューまたは追加比較が必要）'}`,
    '',
    '> この結果はProviderの自動有効化を行いません。関連性と出典品質は人間が0〜5で採点します。',
  ].join('\n');
}
