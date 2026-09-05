import 'server-only';
import {
  normalizePersonalityVersionContent,
  type PersonalityLearningSuggestionPort,
  type PersonalityVersionContent,
  type RecordAiUsageInput,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    proposedContent: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tone: { type: 'string' },
        formality: { type: 'string' },
        energyLevel: { type: 'string' },
        expertiseLevel: { type: 'string' },
        sentenceStyle: { type: 'string' },
        firstPerson: { type: 'string' },
        forbiddenExpressions: { type: 'array', items: { type: 'string' } },
        preferredExpressions: { type: 'array', items: { type: 'string' } },
        visualDirection: { type: ['string', 'null'] },
        facePolicy: { type: 'string', enum: ['ALLOW_FACE', 'PARTIAL_ANONYMOUS', 'FULL_ANONYMOUS'] },
      },
      required: [
        'tone',
        'formality',
        'energyLevel',
        'expertiseLevel',
        'sentenceStyle',
        'firstPerson',
        'forbiddenExpressions',
        'preferredExpressions',
        'visualDirection',
        'facePolicy',
      ],
    },
    reason: { type: 'string' },
  },
  required: ['proposedContent', 'reason'],
} as const;

type OpenAIResponse = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  error?: unknown;
};

export const PERSONALITY_LEARNING_PROMPT_VERSION = 'personality-learning-v1';

export class OpenAIPersonalityLearningSuggestion implements PersonalityLearningSuggestionPort {
  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      requestCostUsdMicros: number;
      recordUsage: (input: RecordAiUsageInput) => Promise<void>;
      fetch?: typeof fetch;
    },
  ) {}
  async suggest(input: Parameters<PersonalityLearningSuggestionPort['suggest']>[0]) {
    const started = Date.now();
    const response = await (this.options.fetch ?? fetch)('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.model,
        store: false,
        input: [
          {
            role: 'system',
            content:
              '現在の人格設定と、低評価になった投稿形式の集計だけを使い、人格設定の小さく安全な改善案を日本語で1件作成してください。推測で人物情報を追加せず、変更不要な項目は維持してください。',
          },
          {
            role: 'user',
            content: JSON.stringify({
              currentContent: input.currentContent,
              evidence: input.evidence,
            }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'personality_learning_suggestion',
            strict: true,
            schema,
          },
        },
      }),
    });
    const value = (await response.json()) as OpenAIResponse;
    if (!response.ok) {
      await this.recordUsage(input, started, value, 'FAILED', 'PROVIDER_FAILED');
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'personality learning provider failed',
        value.error,
      );
    }
    const text = value.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === 'output_text')?.text;
    if (!text) {
      await this.recordUsage(input, started, value, 'FAILED', 'EMPTY_OUTPUT');
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'personality learning provider returned no output',
      );
    }
    try {
      const parsed = JSON.parse(text) as { proposedContent: unknown; reason: unknown };
      if (typeof parsed.reason !== 'string') throw new Error('invalid reason');
      const result = {
        proposedContent: normalizePersonalityVersionContent(
          parsed.proposedContent as PersonalityVersionContent,
        ),
        reason: parsed.reason.slice(0, 500),
      };
      await this.recordUsage(input, started, value, 'SUCCESS', null);
      return result;
    } catch (error) {
      await this.recordUsage(input, started, value, 'FAILED', 'INVALID_OUTPUT');
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'personality learning provider returned invalid output',
        error,
      );
    }
  }

  private recordUsage(
    input: Parameters<PersonalityLearningSuggestionPort['suggest']>[0],
    started: number,
    value: OpenAIResponse,
    status: RecordAiUsageInput['status'],
    errorCode: string | null,
  ) {
    return this.options.recordUsage({
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      actorUserId: input.actorUserId,
      taskType: 'PERSONALITY_LEARNING_PROPOSAL',
      provider: 'OPENAI',
      model: value.model ?? this.options.model,
      promptVersion: PERSONALITY_LEARNING_PROMPT_VERSION,
      status,
      inputTokens: value.usage?.input_tokens ?? null,
      outputTokens: value.usage?.output_tokens ?? null,
      latencyMs: Date.now() - started,
      estimatedCostUsdMicros: this.options.requestCostUsdMicros,
      errorCode,
      idempotencyKey: input.usageIdempotencyKey,
    });
  }
}
