import type { BunshinCapabilityAssignmentRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export * from './social-profile';
export * from './social-account-strategy';
export * from './content-pillars';
export * from './weekly-plan';
export * from './mission-generation';
export * from './daily-mission-runtime';
export * from './mission-engagement';
export {
  assertPlatformFormat,
  normalizeMissionContent,
  type MissionContent,
} from './mission-content';
export * from './trend-research';
import { DailyMissionMutation } from './daily-mission-authorization';
import type { DailyMissionRepository, DailyMissionScope } from './daily-mission-runtime';
import type { MissionActivity } from './mission-engagement';
import { missionIdempotencyKey } from './mission-engagement-validation';
import { SOCIAL_PLATFORMS, type SocialPlatform } from './social-profile';
export const POST_SOURCES = ['MANUAL'] as const;
export type PostSource = (typeof POST_SOURCES)[number];
export const MISSION_FEEDBACK_RATINGS = ['GOOD', 'NEUTRAL', 'BAD'] as const;
export type MissionFeedbackRating = (typeof MISSION_FEEDBACK_RATINGS)[number];

export interface PostRecord {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  platform: SocialPlatform;
  postedAt: Date;
  postUrl: string | null;
  externalPostId: string | null;
  source: PostSource;
  manualMetrics: Record<string, unknown> | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface MissionFeedback {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  rating: MissionFeedbackRating;
  createdAt: Date;
  updatedAt: Date;
}
export interface MissionOutcomeRepository {
  getPost(input: DailyMissionScope & { dailyMissionId: string }): Promise<PostRecord | null>;
  recordPost(
    input: DailyMissionScope & {
      dailyMissionId: string;
      platform: SocialPlatform;
      postedAt: Date;
      postUrl: string | null;
      idempotencyKey: string;
    },
  ): Promise<{ post: PostRecord; activity: MissionActivity } | null>;
  getFeedback(
    input: DailyMissionScope & { dailyMissionId: string },
  ): Promise<MissionFeedback | null>;
  recordFeedback(
    input: DailyMissionScope & {
      dailyMissionId: string;
      rating: MissionFeedbackRating;
      idempotencyKey: string;
    },
  ): Promise<{ feedback: MissionFeedback; activity: MissionActivity } | null>;
}

function postUrl(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === '') return null;
  const normalized = value.trim();
  if (normalized.length > 2048) throw new ApplicationError('VALIDATION_ERROR', 'invalid post url');
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid post url');
  }
  return normalized;
}
export class GetPostRecord {
  constructor(private readonly outcomes: MissionOutcomeRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.outcomes.getPost(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'post record not found');
    return value;
  }
}
export class RecordManualPost extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly outcomes: MissionOutcomeRepository,
  ) {
    super(missions, assignments);
  }
  async execute(
    input: DailyMissionScope & {
      dailyMissionId: string;
      platform: SocialPlatform;
      postedAt?: Date;
      postUrl?: string | null;
      idempotencyKey: string;
    },
  ) {
    await this.requireActive(input);
    if (!SOCIAL_PLATFORMS.includes(input.platform))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid platform');
    const postedAt = input.postedAt ?? new Date();
    if (Number.isNaN(postedAt.valueOf()) || postedAt.valueOf() > Date.now() + 5 * 60_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid posted at');
    const value = await this.outcomes.recordPost({
      ...input,
      postedAt,
      postUrl: postUrl(input.postUrl),
      idempotencyKey: missionIdempotencyKey(input.idempotencyKey),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}
export class GetMissionFeedback {
  constructor(private readonly outcomes: MissionOutcomeRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.outcomes.getFeedback(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'mission feedback not found');
    return value;
  }
}
export class RecordMissionFeedback extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly outcomes: MissionOutcomeRepository,
  ) {
    super(missions, assignments);
  }
  async execute(
    input: DailyMissionScope & {
      dailyMissionId: string;
      rating: MissionFeedbackRating;
      idempotencyKey: string;
    },
  ) {
    await this.requireActive(input);
    if (!MISSION_FEEDBACK_RATINGS.includes(input.rating))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback rating');
    const value = await this.outcomes.recordFeedback({
      ...input,
      idempotencyKey: missionIdempotencyKey(input.idempotencyKey),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'post record not found');
    return value;
  }
}

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

export const GOLDEN_EVALUATION_OUTCOMES = ['ACCEPTED', 'REJECTED', 'FALLBACK'] as const;
export type GoldenEvaluationOutcome = (typeof GOLDEN_EVALUATION_OUTCOMES)[number];
export const GOLDEN_DATA_CLASSES = [
  'PUBLIC',
  'INTERNAL',
  'USER_PRIVATE',
  'RESTRICTED',
  'SECRET',
] as const;
export type GoldenDataClass = (typeof GOLDEN_DATA_CLASSES)[number];
export const GOLDEN_ALLOWED_TOOLS = [
  'TREND_EVIDENCE_READ',
  'BUNSHIN_CONTEXT_READ',
  'KNOWLEDGE_GRANT_READ',
  'CANDIDATE_SUBMIT',
] as const;
export type GoldenAllowedTool = (typeof GOLDEN_ALLOWED_TOOLS)[number];
export const GOLDEN_VIOLATION_CODES = [
  'OUTCOME_MISMATCH',
  'FAILURE_CATEGORY_MISMATCH',
  'FORBIDDEN_FRAGMENT',
  'DATA_POLICY_VIOLATION',
  'TOOL_POLICY_VIOLATION',
  'COST_LIMIT_EXCEEDED',
  'LATENCY_LIMIT_EXCEEDED',
  'RETRY_LIMIT_EXCEEDED',
  'RESULT_COUNT_EXCEEDED',
  'UNSAFE_URL',
] as const;
export type GoldenViolationCode = (typeof GOLDEN_VIOLATION_CODES)[number];

export interface GoldenDatasetCase {
  id: string;
  category: string;
  input: TrendSearchQuery;
  expectation: {
    outcome: GoldenEvaluationOutcome;
    failureCategory: TrendSearchFailureCategory | null;
    allowedDataClasses: GoldenDataClass[];
    allowedTools: GoldenAllowedTool[];
    forbiddenFragments: string[];
    maximumCostUsdMicros: number;
    maximumLatencyMs: number;
    maximumRetries: number;
  };
}
export interface GoldenDataset {
  version: string;
  cases: GoldenDatasetCase[];
}
export interface GoldenEvaluationObservation {
  outcome: GoldenEvaluationOutcome;
  failureCategory: TrendSearchFailureCategory | null;
  result: TrendSearchResult | null;
  emittedText: string[];
  accessedDataClasses: GoldenDataClass[];
  attemptedTools: string[];
  costUsdMicros: number;
  latencyMs: number;
  retryCount: number;
}
export interface GoldenEvaluationReport {
  caseId: string;
  passed: boolean;
  violations: GoldenViolationCode[];
}
export const GOLDEN_RUN_CONFIGURATION_ERROR_CODES = [
  'MISSING_OBSERVATION',
  'DUPLICATE_OBSERVATION',
  'UNKNOWN_CASE',
] as const;
export type GoldenRunConfigurationErrorCode = (typeof GOLDEN_RUN_CONFIGURATION_ERROR_CODES)[number];
export interface GoldenDatasetObservation {
  caseId: string;
  observation: GoldenEvaluationObservation;
}
export interface GoldenDatasetRunReport {
  datasetVersion: string;
  passed: boolean;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  reports: GoldenEvaluationReport[];
  configurationErrors: Array<{ code: GoldenRunConfigurationErrorCode; caseId: string }>;
}

function goldenUnique<T>(values: T[]) {
  return [...new Set(values)];
}
function goldenHasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return expected.length === actual.length && expected.every((key, index) => key === actual[index]);
}
function goldenSafeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}
export function evaluateGoldenDatasetCase(
  testCase: GoldenDatasetCase,
  observation: GoldenEvaluationObservation,
): GoldenEvaluationReport {
  const violations: GoldenViolationCode[] = [];
  const expected = testCase.expectation;
  if (observation.outcome !== expected.outcome) violations.push('OUTCOME_MISMATCH');
  if (observation.failureCategory !== expected.failureCategory)
    violations.push('FAILURE_CATEGORY_MISMATCH');
  const resultText =
    observation.result?.items.flatMap((item) => [item.title, ...item.highlights]) ?? [];
  const text = [...observation.emittedText, ...resultText].join('\n').toLocaleLowerCase('ja-JP');
  if (
    expected.forbiddenFragments.some((fragment) =>
      text.includes(fragment.toLocaleLowerCase('ja-JP')),
    )
  )
    violations.push('FORBIDDEN_FRAGMENT');
  if (
    observation.accessedDataClasses.some(
      (dataClass) => !expected.allowedDataClasses.includes(dataClass),
    )
  )
    violations.push('DATA_POLICY_VIOLATION');
  if (
    observation.attemptedTools.some(
      (tool) => !expected.allowedTools.includes(tool as GoldenAllowedTool),
    )
  )
    violations.push('TOOL_POLICY_VIOLATION');
  if (observation.costUsdMicros > expected.maximumCostUsdMicros)
    violations.push('COST_LIMIT_EXCEEDED');
  if (observation.latencyMs > expected.maximumLatencyMs) violations.push('LATENCY_LIMIT_EXCEEDED');
  if (observation.retryCount > expected.maximumRetries) violations.push('RETRY_LIMIT_EXCEEDED');
  if (observation.result && observation.result.items.length > testCase.input.maximumResults)
    violations.push('RESULT_COUNT_EXCEEDED');
  if (observation.result?.items.some((item) => !goldenSafeUrl(item.url)))
    violations.push('UNSAFE_URL');
  const unique = goldenUnique(violations);
  return { caseId: testCase.id, passed: unique.length === 0, violations: unique };
}

export function runGoldenDatasetRegression(
  dataset: GoldenDataset,
  observations: GoldenDatasetObservation[],
): GoldenDatasetRunReport {
  const knownIds = new Set(dataset.cases.map((item) => item.id));
  const grouped = new Map<string, GoldenEvaluationObservation[]>();
  for (const item of observations) {
    const values = grouped.get(item.caseId) ?? [];
    values.push(item.observation);
    grouped.set(item.caseId, values);
  }
  const configurationErrors: GoldenDatasetRunReport['configurationErrors'] = [];
  for (const caseId of grouped.keys()) {
    if (!knownIds.has(caseId)) configurationErrors.push({ code: 'UNKNOWN_CASE', caseId });
  }
  const reports: GoldenEvaluationReport[] = [];
  for (const testCase of dataset.cases) {
    const values = grouped.get(testCase.id) ?? [];
    if (values.length === 0) {
      configurationErrors.push({ code: 'MISSING_OBSERVATION', caseId: testCase.id });
      continue;
    }
    if (values.length > 1) {
      configurationErrors.push({ code: 'DUPLICATE_OBSERVATION', caseId: testCase.id });
      continue;
    }
    const observation = values[0];
    if (observation) reports.push(evaluateGoldenDatasetCase(testCase, observation));
  }
  const passedCases = reports.filter((item) => item.passed).length;
  const failedCases = dataset.cases.length - passedCases;
  return {
    datasetVersion: dataset.version,
    passed: configurationErrors.length === 0 && failedCases === 0,
    totalCases: dataset.cases.length,
    passedCases,
    failedCases,
    reports,
    configurationErrors,
  };
}

export function parseGoldenDataset(value: unknown): GoldenDataset {
  if (!value || typeof value !== 'object') throw new Error('golden dataset must be an object');
  const candidate = value as { version?: unknown; cases?: unknown };
  if (!goldenHasExactKeys(value as Record<string, unknown>, ['version', 'cases']))
    throw new Error('golden dataset has unknown fields');
  if (typeof candidate.version !== 'string' || candidate.version.trim().length === 0)
    throw new Error('golden dataset version is required');
  if (!Array.isArray(candidate.cases) || candidate.cases.length === 0)
    throw new Error('golden dataset cases are required');
  const cases = candidate.cases.map((entry, index): GoldenDatasetCase => {
    if (!entry || typeof entry !== 'object') throw new Error(`golden case ${index} is invalid`);
    const row = entry as Record<string, unknown>;
    const input = row['input'] as Record<string, unknown> | undefined;
    const expectation = row['expectation'] as Record<string, unknown> | undefined;
    if (
      typeof row['id'] !== 'string' ||
      typeof row['category'] !== 'string' ||
      !input ||
      !expectation
    )
      throw new Error(`golden case ${index} identity is invalid`);
    if (!goldenHasExactKeys(row, ['id', 'category', 'input', 'expectation']))
      throw new Error(`golden case ${row['id']} has unknown fields`);
    if (
      !goldenHasExactKeys(input, [
        'query',
        'language',
        'country',
        'publishedAfter',
        'maximumResults',
      ])
    )
      throw new Error(`golden case ${row['id']} input has unknown fields`);
    if (
      !goldenHasExactKeys(expectation, [
        'outcome',
        'failureCategory',
        'allowedDataClasses',
        'allowedTools',
        'forbiddenFragments',
        'maximumCostUsdMicros',
        'maximumLatencyMs',
        'maximumRetries',
      ])
    )
      throw new Error(`golden case ${row['id']} expectation has unknown fields`);
    const publishedAfter = new Date(String(input['publishedAfter']));
    const maximumResults = input['maximumResults'];
    if (
      typeof input['query'] !== 'string' ||
      typeof input['language'] !== 'string' ||
      typeof input['country'] !== 'string' ||
      Number.isNaN(publishedAfter.valueOf()) ||
      typeof maximumResults !== 'number' ||
      !Number.isInteger(maximumResults) ||
      maximumResults < 1 ||
      maximumResults > 10
    )
      throw new Error(`golden case ${row['id']} input is invalid`);
    const outcome = expectation['outcome'];
    const failureCategory = expectation['failureCategory'];
    const allowedDataClasses = expectation['allowedDataClasses'];
    const allowedTools = expectation['allowedTools'];
    const forbiddenFragments = expectation['forbiddenFragments'];
    if (
      !GOLDEN_EVALUATION_OUTCOMES.includes(outcome as GoldenEvaluationOutcome) ||
      !(
        failureCategory === null ||
        (typeof failureCategory === 'string' &&
          [
            'AUTHENTICATION',
            'RATE_LIMIT',
            'QUOTA',
            'TIMEOUT_OR_NETWORK',
            'PROVIDER_ERROR',
            'INVALID_RESPONSE',
          ].includes(failureCategory))
      ) ||
      !Array.isArray(allowedDataClasses) ||
      !allowedDataClasses.every((item) => GOLDEN_DATA_CLASSES.includes(item as GoldenDataClass)) ||
      !Array.isArray(allowedTools) ||
      !allowedTools.every((item) => GOLDEN_ALLOWED_TOOLS.includes(item as GoldenAllowedTool)) ||
      !Array.isArray(forbiddenFragments) ||
      !forbiddenFragments.every((item) => typeof item === 'string')
    )
      throw new Error(`golden case ${row['id']} expectation is invalid`);
    for (const field of ['maximumCostUsdMicros', 'maximumLatencyMs', 'maximumRetries'] as const) {
      if (typeof expectation[field] !== 'number' || expectation[field] < 0)
        throw new Error(`golden case ${row['id']} ${field} is invalid`);
    }
    return {
      id: row['id'],
      category: row['category'],
      input: {
        query: input['query'],
        language: input['language'],
        country: input['country'],
        publishedAfter,
        maximumResults,
      },
      expectation: {
        outcome: outcome as GoldenEvaluationOutcome,
        failureCategory: failureCategory as TrendSearchFailureCategory | null,
        allowedDataClasses: allowedDataClasses as GoldenDataClass[],
        allowedTools: allowedTools as GoldenAllowedTool[],
        forbiddenFragments,
        maximumCostUsdMicros: expectation['maximumCostUsdMicros'] as number,
        maximumLatencyMs: expectation['maximumLatencyMs'] as number,
        maximumRetries: expectation['maximumRetries'] as number,
      },
    };
  });
  if (new Set(cases.map((item) => item.id)).size !== cases.length)
    throw new Error('golden dataset case ids must be unique');
  return { version: candidate.version.trim(), cases };
}
