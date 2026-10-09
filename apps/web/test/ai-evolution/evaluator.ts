import { createHash } from 'node:crypto';
import { GenerateWeeklyPlan, normalizeMissionContent } from '@bunshin/capability-social';
import {
  AI_TRAINING_SKILL_RULE_VERSION,
  definePracticeCompletion,
} from '@bunshin/capability-training';
import { z } from 'zod';
import {
  OpenAIDailyMissionPlanner,
  DAILY_MISSION_PLANNER_PROMPT_VERSION,
} from '../../src/providers/openai-daily-mission-planner';
import {
  OpenAIWeeklyPlanner,
  WEEKLY_PLANNER_PROMPT_VERSION,
} from '../../src/providers/openai-weekly-planner';
import {
  OpenAiTrainingAnswerEvaluator,
  TRAINING_EVALUATION_PROMPT_VERSION,
} from '../../src/providers/openai-training-answer-evaluator';
import { inspectDailyMissionContent } from '../../src/services/daily-mission-content-quality';
import { DATASET_VERSION, evaluationCases, type EvaluationCase, type Verdict } from './dataset';

export const EVALUATION_RULE_VERSION = 'EVO01_OFFLINE_RULES_V1';
export const MODEL_ID = 'gpt-5.2';
export const promptVersions: Record<EvaluationCase['task'], string> = {
  DAILY_MISSION: DAILY_MISSION_PLANNER_PROMPT_VERSION,
  WEEKLY_PLAN: WEEKLY_PLANNER_PROMPT_VERSION,
  ASSESSMENT: TRAINING_EVALUATION_PROMPT_VERSION,
};
export const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type Check = {
  rule: string;
  category: 'MANDATORY' | 'COMPARATIVE';
  result: Verdict;
  reason: string;
};
export type CaseResult = {
  caseId: string;
  service: 'HASHIEE' | 'MANABERU_STYLE';
  task: EvaluationCase['task'];
  promptVersion: string;
  observed: Verdict;
  expected: Verdict;
  testResult: 'PASS' | 'FAIL';
  checks: Check[];
};
const dailySchema = z
  .object({
    topic: z.string().min(1),
    angle: z.string().min(1),
    reason: z.string().min(1),
    estimatedMinutes: z.number().int().min(1).max(20),
    usedTrendIdea: z.boolean(),
    personalizationSourceTypes: z.array(z.string()).optional(),
    personalizationReason: z.string().optional(),
  })
  .strict();

/** Only injected canned fetch is available. No credentials, SDK, Repository or environment resolver. */
export async function evaluateCase(item: EvaluationCase, modelId = MODEL_ID): Promise<CaseResult> {
  const checks: Check[] = [];
  const record = (rule: string, ok: boolean, category: Check['category'] = 'MANDATORY') =>
    checks.push({
      rule,
      category,
      result: ok ? 'PASS' : 'FAIL',
      reason: ok ? 'ORACLE_SATISFIED' : 'ORACLE_VIOLATION',
    });
  let captured = '';
  let calls = 0;
  const cannedFetch: typeof fetch = (url, init) => {
    if (url !== 'https://api.openai.com/v1/responses' || typeof init?.body !== 'string')
      throw new Error('unsupported offline request');
    captured = init.body;
    calls += 1;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          model: modelId,
          // Deliberately no usage: mock time/tokens/cost must not become measurements.
          output: [{ content: [{ type: 'output_text', text: JSON.stringify(item.response) }] }],
        }),
        { status: 200 },
      ),
    );
  };
  let output: unknown;
  try {
    if (item.task === 'DAILY_MISSION') {
      const result = await new OpenAIDailyMissionPlanner({
        apiKey: 'offline-not-a-credential',
        model: modelId,
        fetch: cannedFetch,
      }).generate(structuredClone(item.input));
      const parsed = dailySchema.parse(result.output);
      normalizeMissionContent('TEXT', {
        body: item.body,
        threadParts: [],
        cta: null,
        caption: null,
        hashtags: [],
        photoInstruction: null,
      });
      record('FIXTURE_SHORT_TEXT_LIMIT', item.body.length <= 280, 'COMPARATIVE');
      record(
        'EXISTING_DUPLICATE_CONTENT_GATE',
        inspectDailyMissionContent({
          content: { body: item.body },
          recentMissions:
            item.previousBody === null
              ? []
              : [
                  {
                    missionDate: '2026-10-04',
                    topic: 'previous',
                    angle: 'previous',
                    content: { body: item.previousBody },
                  },
                ],
        }) === null,
      );
      output = { brief: parsed, body: item.body };
    } else if (item.task === 'WEEKLY_PLAN') {
      output = await new GenerateWeeklyPlan(
        new OpenAIWeeklyPlanner({
          apiKey: 'offline-not-a-credential',
          model: modelId,
          fetch: cannedFetch,
        }),
      ).execute(structuredClone(item.input));
    } else if (item.response === null) {
      checks.push({
        rule: 'ASSESSMENT_EVIDENCE',
        category: 'MANDATORY',
        result: 'UNKNOWN',
        reason: 'NO_EVALUATION_AVAILABLE',
      });
    } else {
      const result = await new OpenAiTrainingAnswerEvaluator({
        apiKey: 'offline-not-a-credential',
        model: modelId,
        requestCostUsdMicros: 0,
        fetch: cannedFetch,
      }).evaluate({ missionDefinitionKey: item.missionKey, answer: item.answer });
      output = result.evaluation;
      record('ASSESSMENT_GROUND_TRUTH', result.evaluation.result === item.expectedAssessment);
      const completion = definePracticeCompletion({
        command: { action: 'COMPLETE', learnerConfirmedCompletion: true, usefulResult: true },
        started: true,
        interactions: ['SELF_PROMPTED', 'SELF_EVALUATED'],
        assessmentVerified: true,
        supportLevel: 'GUIDED',
      });
      record(
        'CAPABILITY_NOT_ARTIFACT_QUALITY',
        completion.capabilityLevel === 'UNKNOWN' && completion.outcomeQuality === 'UNKNOWN',
      );
      record('LEARNER_LEVEL_UNKNOWN', item.learnerLevel === 'UNKNOWN');
    }
    if (output !== undefined) record('OUTPUT_SCHEMA', true);
  } catch {
    // Do not copy provider output, request or arbitrary error messages into reports.
    checks.push({
      rule: 'OUTPUT_SCHEMA_OR_EXISTING_GATE',
      category: 'MANDATORY',
      result: 'FAIL',
      reason: 'VALIDATION_REJECTED',
    });
  }
  if (calls > 0) {
    record(
      'SCOPED_INPUT_FIXTURE',
      item.requiredInput.every((s) => captured.includes(s)) &&
        !captured.includes(
          item.task === 'ASSESSMENT'
            ? 'SYNTHETIC_LEARNER_B_ONLY'
            : item.id === 'daily-other-user-personalization'
              ? 'SYNTHETIC_OWNER_A_ONLY'
              : 'SYNTHETIC_OWNER_B_ONLY',
        ),
    );
  }
  if (output !== undefined) {
    const text = JSON.stringify(output);
    record(
      'NO_FOREIGN_OR_UNVERIFIED_FACTS',
      item.forbiddenOutput.every((s) => !text.includes(s)),
    );
    record(
      'CONTEXT_HISTORY_AND_SPECIFICITY',
      item.requiredOutput.every((s) => text.includes(s)),
      'COMPARATIVE',
    );
  }
  const observed = checks.some((c) => c.result === 'FAIL')
    ? 'FAIL'
    : checks.some((c) => c.result === 'UNKNOWN')
      ? 'UNKNOWN'
      : 'PASS';
  return {
    caseId: item.id,
    service: item.task === 'ASSESSMENT' ? 'MANABERU_STYLE' : 'HASHIEE',
    task: item.task,
    promptVersion: promptVersions[item.task],
    observed,
    expected: item.expected,
    testResult: observed === item.expected ? 'PASS' : 'FAIL',
    checks,
  };
}

export type EvaluationReport = {
  schemaVersion: 'EVO01_REPORT_V1';
  evaluationId: string;
  codeCommit: string;
  workingTreeDirty: boolean;
  sourceDigest: string;
  modelId: string;
  executionMode: 'OFFLINE_SYNTHETIC';
  externalCalls: 0;
  evaluatedAt: string;
  datasetVersion: string;
  datasetDigest: string;
  evaluationRuleVersion: string;
  domainRuleVersions: { training: string };
  promptVersions: typeof promptVersions;
  cases: CaseResult[];
  summary: { cases: number; PASS: number; FAIL: number; UNKNOWN: number; testFailures: number };
  unmeasured: string[];
  humanReview: { status: 'PENDING' };
  releaseVerdict: 'UNKNOWN';
};

const verdictSchema = z.enum(['PASS', 'FAIL', 'UNKNOWN']);
const reportSchema = z
  .object({
    schemaVersion: z.literal('EVO01_REPORT_V1'),
    evaluationId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    codeCommit: z.string().regex(/^[a-f0-9]{40}$/),
    workingTreeDirty: z.boolean(),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    modelId: z.string().min(1).max(120),
    executionMode: z.literal('OFFLINE_SYNTHETIC'),
    externalCalls: z.literal(0),
    evaluatedAt: z.string().datetime(),
    datasetVersion: z.string().min(1),
    datasetDigest: z.string().regex(/^[a-f0-9]{64}$/),
    evaluationRuleVersion: z.string().min(1),
    domainRuleVersions: z.object({ training: z.string().min(1) }).strict(),
    promptVersions: z
      .object({ DAILY_MISSION: z.string(), WEEKLY_PLAN: z.string(), ASSESSMENT: z.string() })
      .strict(),
    cases: z
      .array(
        z
          .object({
            caseId: z.string().regex(/^[a-z0-9-]+$/),
            service: z.enum(['HASHIEE', 'MANABERU_STYLE']),
            task: z.enum(['DAILY_MISSION', 'WEEKLY_PLAN', 'ASSESSMENT']),
            promptVersion: z.string(),
            observed: verdictSchema,
            expected: verdictSchema,
            testResult: z.enum(['PASS', 'FAIL']),
            checks: z
              .array(
                z
                  .object({
                    rule: z.string(),
                    category: z.enum(['MANDATORY', 'COMPARATIVE']),
                    result: verdictSchema,
                    reason: z.string(),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
    summary: z
      .object({
        cases: z.number().int().nonnegative(),
        PASS: z.number().int().nonnegative(),
        FAIL: z.number().int().nonnegative(),
        UNKNOWN: z.number().int().nonnegative(),
        testFailures: z.number().int().nonnegative(),
      })
      .strict(),
    unmeasured: z.array(z.string()),
    humanReview: z.object({ status: z.literal('PENDING') }).strict(),
    releaseVerdict: z.literal('UNKNOWN'),
  })
  .strict();

export function parseEvaluationReport(value: unknown): EvaluationReport {
  const report = reportSchema.parse(value);
  const recomputed = {
    cases: report.cases.length,
    PASS: report.cases.filter((c) => c.observed === 'PASS').length,
    FAIL: report.cases.filter((c) => c.observed === 'FAIL').length,
    UNKNOWN: report.cases.filter((c) => c.observed === 'UNKNOWN').length,
    testFailures: report.cases.filter((c) => c.testResult === 'FAIL').length,
  };
  if (
    digest(recomputed) !== digest(report.summary) ||
    new Set(report.cases.map((c) => c.caseId)).size !== report.cases.length ||
    report.cases.some(
      (c) =>
        c.promptVersion !== report.promptVersions[c.task] ||
        c.service !== (c.task === 'ASSESSMENT' ? 'MANABERU_STYLE' : 'HASHIEE') ||
        c.observed !==
          (c.checks.some((check) => check.result === 'FAIL')
            ? 'FAIL'
            : c.checks.some((check) => check.result === 'UNKNOWN')
              ? 'UNKNOWN'
              : 'PASS') ||
        c.testResult !== (c.observed === c.expected ? 'PASS' : 'FAIL'),
    )
  )
    throw new Error('inconsistent report');
  return report;
}
export async function runBaseline(input: {
  evaluationId: string;
  codeCommit: string;
  workingTreeDirty: boolean;
  sourceDigest: string;
  evaluatedAt: string;
  modelId?: string;
}): Promise<EvaluationReport> {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(input.evaluationId) ||
    !/^[a-f0-9]{40}$/.test(input.codeCommit) ||
    !/^[a-f0-9]{64}$/.test(input.sourceDigest) ||
    !Number.isFinite(Date.parse(input.evaluatedAt))
  )
    throw new Error('invalid run provenance');
  const modelId = input.modelId ?? MODEL_ID;
  const cases = await Promise.all(evaluationCases.map((item) => evaluateCase(item, modelId)));
  return {
    schemaVersion: 'EVO01_REPORT_V1',
    ...input,
    modelId,
    executionMode: 'OFFLINE_SYNTHETIC',
    externalCalls: 0,
    datasetVersion: DATASET_VERSION,
    datasetDigest: digest(evaluationCases),
    evaluationRuleVersion: EVALUATION_RULE_VERSION,
    domainRuleVersions: { training: AI_TRAINING_SKILL_RULE_VERSION },
    promptVersions,
    cases,
    summary: {
      cases: cases.length,
      PASS: cases.filter((c) => c.observed === 'PASS').length,
      FAIL: cases.filter((c) => c.observed === 'FAIL').length,
      UNKNOWN: cases.filter((c) => c.observed === 'UNKNOWN').length,
      testFailures: cases.filter((c) => c.testResult === 'FAIL').length,
    },
    unmeasured: [
      'REAL_MODEL_QUALITY',
      'LATENCY',
      'INPUT_TOKENS',
      'OUTPUT_TOKENS',
      'API_COST',
      'PROVIDER_ERROR_RATE',
      'RUNTIME_AUTHORIZATION_CONTRACT_PILOT',
      'PRODUCTION_TENANT_ISOLATION',
      'HUMAN_SEMANTIC_REVIEW',
    ],
    humanReview: { status: 'PENDING' },
    releaseVerdict: 'UNKNOWN',
  };
}

export function compareReports(baseline: EvaluationReport, candidate: EvaluationReport) {
  const caseKeys = (r: EvaluationReport) => r.cases.map((c) => `${c.task}:${c.caseId}`).sort();
  const comparable =
    baseline.schemaVersion === candidate.schemaVersion &&
    baseline.executionMode === candidate.executionMode &&
    baseline.datasetVersion === candidate.datasetVersion &&
    baseline.datasetDigest === candidate.datasetDigest &&
    baseline.evaluationRuleVersion === candidate.evaluationRuleVersion &&
    digest(baseline.domainRuleVersions) === digest(candidate.domainRuleVersions) &&
    digest(caseKeys(baseline)) === digest(caseKeys(candidate));
  if (!comparable)
    return {
      status: 'INCOMPARABLE' as const,
      changes: [],
      reason: 'DATASET_RULE_MODE_OR_CASE_SET_CHANGED',
    };
  const old = new Map(baseline.cases.map((c) => [c.caseId, c]));
  const changes = candidate.cases.flatMap((c) => {
    const previous = old.get(c.caseId)!;
    return previous.observed !== c.observed || digest(previous.checks) !== digest(c.checks)
      ? [{ caseId: c.caseId, before: previous.observed, after: c.observed }]
      : [];
  });
  return {
    status: 'COMPARABLE' as const,
    changes,
    variants: {
      modelChanged: baseline.modelId !== candidate.modelId,
      promptChanged: digest(baseline.promptVersions) !== digest(candidate.promptVersions),
      codeChanged:
        baseline.codeCommit !== candidate.codeCommit ||
        baseline.sourceDigest !== candidate.sourceDigest,
    },
    qualityAndCostConclusion: 'UNKNOWN' as const,
  };
}
