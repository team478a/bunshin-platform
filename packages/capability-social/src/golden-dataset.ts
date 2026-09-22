import type {
  TrendSearchFailureCategory,
  TrendSearchQuery,
  TrendSearchResult,
} from './trend-provider-benchmark';
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
