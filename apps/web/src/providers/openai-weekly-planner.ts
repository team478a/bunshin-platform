import 'server-only';
import {
  SOCIAL_PREFERRED_FORMATS,
  type WeeklyPlannerInput,
  type WeeklyPlannerOutput,
  type WeeklyPlannerPort,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

export const WEEKLY_PLANNER_PROMPT_VERSION = 'weekly-planner-v3';
const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    strategySummary: { type: 'string' },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scheduledDate: { type: 'string' },
          contentPillarId: { type: 'string' },
          goal: { type: 'string' },
          angle: { type: 'string' },
          recommendedFormat: { type: 'string', enum: SOCIAL_PREFERRED_FORMATS },
          notes: { type: ['string', 'null'] },
          campaignId: { type: ['string', 'null'] },
          classification: {
            type: 'string',
            enum: ['ORGANIC', 'PRODUCT_RELATED', 'ADVERTISEMENT'],
          },
        },
        required: [
          'scheduledDate',
          'contentPillarId',
          'goal',
          'angle',
          'recommendedFormat',
          'notes',
          'campaignId',
          'classification',
        ],
      },
    },
  },
  required: ['strategySummary', 'items'],
} as const;
type ResponseValue = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  error?: unknown;
};
export class OpenAIWeeklyPlanner implements WeeklyPlannerPort {
  constructor(private readonly options: { apiKey: string; model?: string; fetch?: typeof fetch }) {}
  async generate(input: WeeklyPlannerInput) {
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
              'あなたはBUNSHINのSNS週間企画担当です。対象Bunshin、承認済み戦略、Active Content Pillar、Grant済みKnowledge、本人が参加中のCampaignだけを使い、指定週内で実行可能な日本語計画を作成してください。recentPerformanceは直近28日間の匿名化された本人集計です。GOODが多い形式は無理のない範囲で優先し、BADが多い形式は改善した別角度を選びます。ただし件数が少ない場合は断定せず、投稿形式の偏りも避けてください。通常投稿はORGANICかつcampaignId=nullです。商品周辺はPRODUCT_RELATED、直接の商品紹介はADVERTISEMENTとして対象campaignIdを付けます。各Campaignの上限とcooldownDaysを必ず守り、商品投稿だけで週を埋めません。画像・動画そのものや自動投稿は行いません。',
          },
          { role: 'user', content: JSON.stringify(input) },
        ],
        text: { format: { type: 'json_schema', name: 'weekly_plan', strict: true, schema } },
      }),
    });
    const value = (await response.json()) as ResponseValue;
    if (!response.ok)
      throw new ApplicationError('INTERNAL_ERROR', 'weekly planner provider failed', value.error);
    const text = value.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === 'output_text')?.text;
    if (!text) throw new ApplicationError('INTERNAL_ERROR', 'weekly planner returned no output');
    let output: WeeklyPlannerOutput;
    try {
      output = JSON.parse(text) as WeeklyPlannerOutput;
    } catch (error) {
      throw new ApplicationError('INTERNAL_ERROR', 'weekly planner returned invalid output', error);
    }
    return {
      output,
      model: value.model ?? model,
      promptVersion: WEEKLY_PLANNER_PROMPT_VERSION,
      inputTokens: value.usage?.input_tokens ?? null,
      outputTokens: value.usage?.output_tokens ?? null,
      latencyMs: Date.now() - started,
    };
  }
}
