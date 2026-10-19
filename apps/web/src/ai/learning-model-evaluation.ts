import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { estimateAiCallCost, parseAiTokenPricingRegistry } from '@bunshin/application';
import type { LearningAiProvider } from './learning-provider-runtime';
import {
  reserveLearningProviderRuntimeConfiguration,
  resolveLearningProviderRuntimeConfiguration,
} from './learning-provider-runtime';
import { currentAiProviderEnvironment } from './secure-provider-configuration';
import { recordOpenAiUsageAndSettle } from './openai-cost-admission';
import { learningProposalEvaluationSet } from '../../test/fixtures/learning-proposal-evaluation-set';
import { generateLearningLesson, learningLessonBody } from '../providers/openai-learning-lesson';

const RUBRIC = [
  '能動的な学び',
  '一度に扱う量',
  '本人への合わせ方',
  '手本の後に残す本人の一歩',
  '誤り・画面の推測',
  '範囲外への対応',
  '費用・応答時間',
] as const;

type Candidate = { provider: LearningAiProvider; model: string };
type Entry = {
  blindId: string;
  scenarioId: string;
  provider: LearningAiProvider;
  model: string;
  proposal: unknown;
  scores: Partial<Record<(typeof RUBRIC)[number], number>>;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsdMicros: number | null;
  pricingVersion: string | null;
};

function requiredInteger(name: string, min: number, max: number) {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!raw || !Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`${name} is required and must be between ${min} and ${max}`);
  return parsed;
}

function candidatesFromEnvironment(): Candidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(process.env['LEARNING_EVAL_CANDIDATES'] ?? 'null');
  } catch {
    throw new Error('LEARNING_EVAL_CANDIDATES is invalid');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    parsed.some(
      (value) =>
        !value ||
        typeof value !== 'object' ||
        !['openai', 'google'].includes((value as Record<string, unknown>)['provider'] as string) ||
        typeof (value as Record<string, unknown>)['model'] !== 'string',
    ) ||
    new Set(parsed.map((value) => (value as Record<string, unknown>)['provider'])).size !== 2
  )
    throw new Error('exactly one OpenAI and one Google evaluation model must be configured');
  return parsed as Candidate[];
}

function reserveFromPriceList(input: {
  provider: LearningAiProvider;
  model: string;
  maxRequestBytes: number;
  maxOutputTokens: number;
  configuredRequestCost: number;
  registry: ReturnType<typeof parseAiTokenPricingRegistry>;
  now: Date;
}) {
  const price = input.registry
    .filter(
      (item) =>
        item.provider === input.provider &&
        item.model === input.model &&
        Date.parse(item.effectiveFrom) <= input.now.getTime(),
    )
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0];
  if (!price || price.inputPriceMicrosPerMillion <= 0 || price.outputPriceMicrosPerMillion <= 0)
    throw new Error(`active token pricing is required for ${input.provider}/${input.model}`);
  const ceilMillion = (n: bigint) => (n + 999_999n) / 1_000_000n;
  const tokenCeiling =
    ceilMillion(BigInt(input.maxRequestBytes) * BigInt(price.inputPriceMicrosPerMillion)) +
    ceilMillion(BigInt(input.maxOutputTokens) * BigInt(price.outputPriceMicrosPerMillion));
  if (tokenCeiling > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('evaluation cost limit overflow');
  return Math.max(input.configuredRequestCost, Number(tokenCeiling));
}

function syntheticRequest(scenario: (typeof learningProposalEvaluationSet)[number]) {
  return {
    id: scenario.id,
    revision: 1,
    createdAt: new Date().toISOString(),
    originalText: scenario.wish,
    deviceType: scenario.persona.device.includes('スマートフォン')
      ? ('SMARTPHONE' as const)
      : ('PC' as const),
    toolDescription: scenario.persona.tool,
    experienceDescription: scenario.persona.experience,
    currentPosition: scenario.persona.obstacle,
  };
}

function scoreFromInput(raw: string) {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1 || value > 5)
    throw new Error('score must be an integer from 1 to 5');
  return value;
}

/** Explicit, non-production, synthetic-only blinded comparison. Never invoked by normal CI. */
export async function runLearningModelEvaluation() {
  if (process.env['LEARNING_EVAL_CONFIRM'] !== 'RUN_SYNTHETIC_MODEL_EVALUATION')
    throw new Error('explicit LEARNING_EVAL_CONFIRM is required');
  const environment = currentAiProviderEnvironment();
  if (environment === 'PRODUCTION') throw new Error('model evaluation is disabled in production');
  const workspaceId = process.env['LEARNING_EVAL_WORKSPACE_ID'];
  const actorUserId = process.env['LEARNING_EVAL_ACTOR_USER_ID'];
  if (
    !workspaceId ||
    !actorUserId ||
    !/^[0-9a-f-]{36}$/i.test(workspaceId) ||
    !/^[0-9a-f-]{36}$/i.test(actorUserId)
  )
    throw new Error('dedicated non-production evaluation workspace and user IDs are required');
  const maxRequestBytes = requiredInteger('LEARNING_EVAL_MAX_REQUEST_BYTES', 256, 100_000);
  const maxOutputTokens = requiredInteger('LEARNING_EVAL_MAX_OUTPUT_TOKENS', 32, 10_000);
  const rawPricing = process.env['PERSONAL_LEARNING_AI_PRICING'];
  let pricing: ReturnType<typeof parseAiTokenPricingRegistry>;
  try {
    pricing = parseAiTokenPricingRegistry(JSON.parse(rawPricing ?? 'null'));
  } catch {
    throw new Error('PERSONAL_LEARNING_AI_PRICING must contain a valid, explicit price list');
  }
  const candidates = candidatesFromEnvironment();
  const runtimes = await Promise.all(
    candidates.map(async (candidate) => {
      const runtime = await resolveLearningProviderRuntimeConfiguration(
        candidate.provider,
        'LEARNING_LESSON',
      );
      if (runtime.source !== 'ADMIN_CONFIGURATION')
        throw new Error('evaluation requires an existing saved Provider configuration');
      if (runtime.model !== candidate.model)
        throw new Error(
          `active ${candidate.provider} model does not match the selected evaluation model`,
        );
      return { candidate, runtime };
    }),
  );
  const runId = randomUUID();
  const entries: Entry[] = [];

  for (const scenario of learningProposalEvaluationSet) {
    for (const { candidate, runtime } of runtimes) {
      const blindId = randomUUID();
      const operationKey = `learning-evaluation:${runId}:${candidate.provider}:${scenario.id}`;
      const maxReservedCost = reserveFromPriceList({
        provider: candidate.provider,
        model: runtime.model,
        maxRequestBytes,
        maxOutputTokens,
        configuredRequestCost: runtime.requestCostUsdMicros,
        registry: pricing,
        now: new Date(),
      });
      const admission = await reserveLearningProviderRuntimeConfiguration(
        operationKey,
        candidate.provider,
        'LEARNING_LESSON',
        maxReservedCost,
      );
      if (admission.source !== 'ADMIN_CONFIGURATION' || !admission.admission)
        throw new Error('evaluation requires a reserved saved Provider configuration');
      if (admission.model !== runtime.model) {
        // The reservation helper releases a reservation on local model validation failures.
        throw new Error(`active ${candidate.provider} model changed during evaluation`);
      }
      const body = learningLessonBody(syntheticRequest(scenario), admission.model, {
        maxRequestBytes,
        maxOutputTokens,
      });
      const result = await generateLearningLesson({
        apiKey: admission.apiKey,
        model: admission.model,
        provider: admission.provider,
        modelCapabilities: admission.modelCapabilities,
        body,
      });
      if (!result.requestFinished)
        throw new Error(
          `evaluation request for ${scenario.id} is nonterminal; reservation retained`,
        );
      const cost = estimateAiCallCost(result.measurement, pricing);
      const usageId = `${operationKey}:${blindId.slice(0, 8)}`;
      await recordOpenAiUsageAndSettle(admission, {
        workspaceId,
        bunshinId: null,
        actorUserId,
        taskType: 'LEARNING_MODEL_EVALUATION',
        provider: result.measurement.provider,
        model: result.measurement.model,
        promptVersion: 'learning-model-eval-synthetic-v1',
        status: result.value ? 'SUCCESS' : 'FAILED',
        inputTokens: result.measurement.inputTokens,
        outputTokens: result.measurement.outputTokens,
        latencyMs: result.measurement.latencyMs,
        estimatedCostUsdMicros: cost.totalCostUsdMicros,
        pricingVersion: cost.pricing?.pricingVersion ?? null,
        ...(!result.value ? { errorCode: 'INVALID_EVALUATION_OUTPUT' } : {}),
        idempotencyKey: usageId,
      });
      entries.push({
        blindId,
        scenarioId: scenario.id,
        provider: candidate.provider,
        model: admission.model,
        proposal: result.value,
        scores: {},
        latencyMs: result.measurement.latencyMs,
        inputTokens: result.measurement.inputTokens,
        outputTokens: result.measurement.outputTokens,
        estimatedCostUsdMicros: cost.totalCostUsdMicros,
        pricingVersion: cost.pricing?.pricingVersion ?? null,
      });
    }
  }

  const outputDirectory = path.join(tmpdir(), 'bunshin-learning-model-evaluations', runId);
  await mkdir(outputDirectory, { recursive: true });
  const blindEntries = entries
    .map((entry) => {
      const { provider, model, ...blindEntry } = entry;
      void provider;
      void model;
      return blindEntry;
    })
    .sort(() => Math.random() - 0.5);
  await writeFile(
    path.join(outputDirectory, 'blind-review.json'),
    `${JSON.stringify({ runId, rubric: RUBRIC, entries: blindEntries }, null, 2)}\n`,
    { flag: 'wx' },
  );
  const reviewer = process.env['LEARNING_EVAL_REVIEWER_LABEL']?.trim();
  if (!reviewer || reviewer.length > 80) throw new Error('a short evaluator label is required');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const entry of blindEntries) {
      const scenario = learningProposalEvaluationSet.find((item) => item.id === entry.scenarioId);
      console.info(
        JSON.stringify(
          {
            blindId: entry.blindId,
            scenarioId: entry.scenarioId,
            wish: scenario?.wish,
            proposal: entry.proposal,
          },
          null,
          2,
        ),
      );
      for (const criterion of RUBRIC) {
        const response = await prompt.question(
          `${entry.blindId} / ${entry.scenarioId} / ${criterion} (1-5): `,
        );
        entry.scores[criterion] = scoreFromInput(response);
      }
    }
  } finally {
    prompt.close();
  }
  await writeFile(
    path.join(outputDirectory, 'blind-scores.json'),
    `${JSON.stringify({ runId, reviewer, rubric: RUBRIC, entries: blindEntries }, null, 2)}\n`,
    { flag: 'wx' },
  );
  await writeFile(
    path.join(outputDirectory, 'model-manifest.json'),
    `${JSON.stringify(
      {
        runId,
        environment,
        candidates: entries.map(({ blindId, scenarioId, provider, model }) => ({
          blindId,
          scenarioId,
          provider,
          model,
        })),
        usage: entries.map(
          ({
            blindId,
            scenarioId,
            latencyMs,
            inputTokens,
            outputTokens,
            estimatedCostUsdMicros,
            pricingVersion,
          }) => ({
            blindId,
            scenarioId,
            latencyMs,
            inputTokens,
            outputTokens,
            estimatedCostUsdMicros,
            pricingVersion,
          }),
        ),
      },
      null,
      2,
    )}\n`,
    { flag: 'wx' },
  );
  return { runId, outputDirectory, entryCount: entries.length };
}
