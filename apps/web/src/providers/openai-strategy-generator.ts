import 'server-only';
import type {
  StrategyGeneratorInput,
  StrategyGeneratorPort,
  StrategyGeneratorOutput,
} from '@bunshin/capability-social';
import { missionTransportFailure, readMissionProviderResponse } from './mission-provider-response';

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
const PROVIDER_TIMEOUT_MS = 55_000;
export class OpenAIStrategyGenerator implements StrategyGeneratorPort {
  constructor(private readonly options: { apiKey: string; model?: string; fetch?: typeof fetch }) {}
  async generate(input: StrategyGeneratorInput) {
    const started = Date.now();
    const model = this.options.model ?? 'gpt-5.2';
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)('https://api.openai.com/v1/responses', {
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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
                'あなたは投稿パートナーのSNS戦略担当です。提供された対象BunshinとGrant済みKnowledgeだけを使い、実行可能で誇張のない日本語戦略を作成してください。',
            },
            { role: 'user', content: JSON.stringify(input) },
          ],
          text: {
            format: { type: 'json_schema', name: 'social_account_strategy', strict: true, schema },
          },
        }),
      });
    } catch (error) {
      throw missionTransportFailure(error);
    }
    const { value, output: parsed } = await readMissionProviderResponse(response);
    const output = parsed as StrategyGeneratorOutput;
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
