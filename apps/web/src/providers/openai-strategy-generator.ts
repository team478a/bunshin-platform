import 'server-only';
import type {
  StrategyGeneratorInput,
  StrategyGeneratorPort,
  StrategyGeneratorOutput,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

export const SOCIAL_ACCOUNT_STRATEGY_PROMPT_VERSION = 'social-account-strategy-v1';
const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    concept: { type: 'string' },
    positioning: { type: 'string' },
    targetSummary: { type: 'string' },
    profileDraft: { type: 'string' },
    ctaStrategy: { type: 'string' },
    postingPolicy: { type: 'string' },
  },
  required: [
    'concept',
    'positioning',
    'targetSummary',
    'profileDraft',
    'ctaStrategy',
    'postingPolicy',
  ],
} as const;
type OpenAIResponse = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  error?: { code?: string; message?: string };
};
export class OpenAIStrategyGenerator implements StrategyGeneratorPort {
  constructor(private readonly options: { apiKey: string; model?: string; fetch?: typeof fetch }) {}
  async generate(input: StrategyGeneratorInput) {
    const started = Date.now();
    const model = this.options.model ?? 'gpt-5.2';
    const response = await (this.options.fetch ?? fetch)('https://api.openai.com/v1/responses', {
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
              'あなたはBUNSHINのSNS戦略担当です。提供された対象BunshinとGrant済みKnowledgeだけを使い、実行可能で誇張のない日本語戦略を作成してください。',
          },
          { role: 'user', content: JSON.stringify(input) },
        ],
        text: {
          format: { type: 'json_schema', name: 'social_account_strategy', strict: true, schema },
        },
      }),
    });
    const value = (await response.json()) as OpenAIResponse;
    if (!response.ok)
      throw new ApplicationError('INTERNAL_ERROR', 'strategy provider failed', value.error);
    const text = value.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === 'output_text')?.text;
    if (!text) throw new ApplicationError('INTERNAL_ERROR', 'strategy provider returned no output');
    let output: StrategyGeneratorOutput;
    try {
      output = JSON.parse(text) as StrategyGeneratorOutput;
    } catch (error) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'strategy provider returned invalid output',
        error,
      );
    }
    return {
      output,
      model: value.model ?? model,
      promptVersion: SOCIAL_ACCOUNT_STRATEGY_PROMPT_VERSION,
      inputTokens: value.usage?.input_tokens ?? null,
      outputTokens: value.usage?.output_tokens ?? null,
      latencyMs: Date.now() - started,
    };
  }
}
