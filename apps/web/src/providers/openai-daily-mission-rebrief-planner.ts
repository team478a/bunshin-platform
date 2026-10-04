import 'server-only';

import type {
  DailyMissionPlannerProviderInput,
  MissionPersonalizationSourceType,
  SocialDecisionRebriefOutput,
  SocialDecisionRebriefPreparation,
} from '@bunshin/capability-social';
import { MISSION_PERSONALIZATION_SOURCE_TYPES } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

export const DAILY_MISSION_REBRIEF_PROMPT_VERSION = 'daily-mission-rebrief-v1';

export type DailyMissionRebriefPlannerOutput = SocialDecisionRebriefOutput;

export interface DailyMissionRebriefPlannerResult {
  output: DailyMissionRebriefPlannerOutput;
  model: string;
  promptVersion: typeof DAILY_MISSION_REBRIEF_PROMPT_VERSION;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

type ResponseValue = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  error?: unknown;
};

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topic: { type: 'string' },
    angle: { type: 'string' },
    reason: { type: 'string' },
    estimatedMinutes: { type: 'integer' },
    personalizationSourceTypes: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', enum: MISSION_PERSONALIZATION_SOURCE_TYPES },
    },
    personalizationReason: { type: 'string' },
  },
  required: [
    'topic',
    'angle',
    'reason',
    'estimatedMinutes',
    'personalizationSourceTypes',
    'personalizationReason',
  ],
} as const;

const PROVIDER_TIMEOUT_MS = 55_000;

function unavailable(reason: string, cause?: Record<string, unknown>) {
  return new ApplicationError(
    'AI_PROVIDER_UNAVAILABLE',
    'daily mission rebrief provider unavailable',
    { provider: 'openai', reason, ...cause },
  );
}

function parseResponseValue(body: string): ResponseValue | null {
  if (!body.trim()) return null;
  try {
    const value: unknown = JSON.parse(body);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function safeCampaign(campaign: NonNullable<DailyMissionPlannerProviderInput['campaign']>) {
  return {
    name: campaign.name,
    theme: campaign.theme,
    targetSummary: campaign.targetSummary,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    maxRelatedPerWeek: campaign.maxRelatedPerWeek,
    maxAdsPerWeek: campaign.maxAdsPerWeek,
    cooldownDays: campaign.cooldownDays,
    productPack: {
      version: campaign.productPack.version,
      allowLinklessPosts: campaign.productPack.allowLinklessPosts,
      summary: campaign.productPack.summary,
      providerName: campaign.productPack.providerName,
      targetCustomer: campaign.productPack.targetCustomer,
      facts: structuredClone(campaign.productPack.facts),
      rules: structuredClone(campaign.productPack.rules),
      assets: campaign.productPack.assets.map(({ type, label, usageTerms }) => ({
        type,
        label,
        usageTerms,
      })),
    },
  };
}

function assertContextMatchesRevision(
  context: DailyMissionPlannerProviderInput,
  revision: SocialDecisionRebriefPreparation,
) {
  const locked = revision.lockedConstraints;
  if (
    context.missionDate !== locked.missionDate ||
    context.timezone !== locked.timezone ||
    context.platform !== locked.platform ||
    context.availableMinutes !== locked.availableMinutes ||
    context.approvedStrategy.goal !== locked.currentGoal ||
    context.weeklyItem.goal !== locked.weeklyGoal ||
    context.weeklyItem.angle !== locked.weeklyAngle ||
    context.weeklyItem.recommendedFormat !== locked.format ||
    context.weeklyItem.classification !== locked.classification ||
    (context.weeklyItem.campaignId !== null) !== locked.campaignAttached ||
    (context.campaign !== null && context.campaign !== undefined) !== locked.campaignAttached
  )
    throw new ApplicationError('CONFLICT', 'rebrief planning context changed after preparation');
}

export function projectDailyMissionRebriefProviderInput(input: {
  planningContext: DailyMissionPlannerProviderInput;
  revision: SocialDecisionRebriefPreparation;
}) {
  assertContextMatchesRevision(input.planningContext, input.revision);
  const context = input.planningContext;
  const { campaignId, ...weeklyItem } = context.weeklyItem;
  void campaignId;
  const personality = context.bunshin.personality;
  const providerPersonality = personality
    ? {
        version: personality.version,
        tone: personality.tone,
        formality: personality.formality,
        energyLevel: personality.energyLevel,
        expertiseLevel: personality.expertiseLevel,
        sentenceStyle: personality.sentenceStyle,
        firstPerson: personality.firstPerson,
        forbiddenExpressions: [...personality.forbiddenExpressions],
        preferredExpressions: [...personality.preferredExpressions],
        visualDirection: personality.visualDirection,
        facePolicy: personality.facePolicy,
      }
    : null;
  return {
    planningContext: {
      ...structuredClone(context),
      bunshin: { ...structuredClone(context.bunshin), personality: providerPersonality },
      weeklyItem: { ...structuredClone(weeklyItem), campaignAttached: context.campaign !== null },
      campaign: context.campaign ? safeCampaign(context.campaign) : null,
    },
    revision: structuredClone(input.revision),
  };
}

function boundedString(value: unknown, maximum: number, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid rebrief ${field}`);
  return value.trim();
}

function isPersonalizationSourceType(value: unknown): value is MissionPersonalizationSourceType {
  return (
    typeof value === 'string' &&
    (MISSION_PERSONALIZATION_SOURCE_TYPES as readonly string[]).includes(value)
  );
}

function normalizeOutput(
  value: unknown,
  input: DailyMissionPlannerProviderInput,
): DailyMissionRebriefPlannerOutput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid rebrief output');
  const output = value as Record<string, unknown>;
  if (
    Object.keys(output).sort().join(',') !==
    [
      'angle',
      'estimatedMinutes',
      'personalizationReason',
      'personalizationSourceTypes',
      'reason',
      'topic',
    ].join(',')
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid rebrief output fields');
  if (
    !Number.isInteger(output.estimatedMinutes) ||
    (output.estimatedMinutes as number) < 1 ||
    (output.estimatedMinutes as number) > input.availableMinutes
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid rebrief estimated minutes');
  const available = new Set(input.personalization?.signals.map(({ type }) => type) ?? []);
  const sources = output.personalizationSourceTypes;
  if (!Array.isArray(sources) || sources.length === 0)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid rebrief personalization sources');
  const normalizedSources: MissionPersonalizationSourceType[] = [];
  for (const source of sources as unknown[]) {
    if (!isPersonalizationSourceType(source) || !available.has(source))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rebrief personalization sources');
    normalizedSources.push(source);
  }
  if (new Set(normalizedSources).size !== normalizedSources.length)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid rebrief personalization sources');
  return {
    topic: boundedString(output.topic, 200, 'topic'),
    angle: boundedString(output.angle, 500, 'angle'),
    reason: boundedString(output.reason, 1000, 'reason'),
    estimatedMinutes: output.estimatedMinutes as number,
    personalizationSourceTypes: normalizedSources,
    personalizationReason: boundedString(
      output.personalizationReason,
      500,
      'personalization reason',
    ),
  };
}

export class OpenAIDailyMissionRebriefPlanner {
  constructor(private readonly options: { apiKey: string; model?: string; fetch?: typeof fetch }) {}

  async generate(input: {
    planningContext: DailyMissionPlannerProviderInput;
    revision: SocialDecisionRebriefPreparation;
  }): Promise<DailyMissionRebriefPlannerResult> {
    const providerInput = projectDailyMissionRebriefProviderInput(input);
    const started = Date.now();
    const model = this.options.model ?? 'gpt-5.2';
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          store: false,
          input: [
            {
              role: 'system',
              content:
                'あなたはSNS Mission Briefの再判断担当です。revision.lockedConstraintsを変更せず、previousDecisionの本文ではなく企画判断だけを一度だけ見直します。triggerを解消し、承認済みplanningContextの事実だけを使用してください。投稿本文、caption、台本、画像・動画指示は生成しません。',
            },
            { role: 'user', content: JSON.stringify(providerInput) },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'daily_mission_rebrief',
              strict: true,
              schema,
            },
          },
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      throw unavailable(
        ['AbortError', 'TimeoutError'].includes(name) ? 'TIMEOUT' : 'NETWORK_ERROR',
      );
    }
    let body: string;
    try {
      body = await response.text();
    } catch {
      throw unavailable('RESPONSE_READ_ERROR', { httpStatus: response.status });
    }
    const value = parseResponseValue(body);
    if (!response.ok)
      throw unavailable('HTTP_ERROR', {
        httpStatus: response.status,
        providerErrorCode:
          value?.error &&
          typeof value.error === 'object' &&
          'code' in value.error &&
          typeof value.error.code === 'string'
            ? value.error.code.slice(0, 100)
            : null,
      });
    if (!value) throw unavailable(body.trim() ? 'INVALID_JSON' : 'EMPTY_RESPONSE');
    const text = value.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === 'output_text')?.text;
    if (!text) throw unavailable('MALFORMED_RESPONSE');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw unavailable('MALFORMED_OUTPUT');
    }
    return {
      output: normalizeOutput(parsed, input.planningContext),
      model: value.model ?? model,
      promptVersion: DAILY_MISSION_REBRIEF_PROMPT_VERSION,
      inputTokens: value.usage?.input_tokens ?? null,
      outputTokens: value.usage?.output_tokens ?? null,
      latencyMs: Date.now() - started,
    };
  }
}
