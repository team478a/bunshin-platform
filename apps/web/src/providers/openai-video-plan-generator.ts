import 'server-only';
import type {
  VideoPlanGeneratorInput,
  VideoPlanGeneratorOutput,
  VideoPlanGeneratorPort,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export const VIDEO_PLAN_PROMPT_VERSION = 'video-plan-v1';

type ResponseValue = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  error?: unknown;
};

function outputSchema(durationSeconds: 30 | 60) {
  const minItems = durationSeconds === 30 ? 5 : 8;
  const maxItems = durationSeconds === 30 ? 7 : 12;
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      scenes: {
        type: 'array',
        minItems,
        maxItems,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sceneNo: { type: 'integer', minimum: 1, maximum: maxItems },
            durationMs: { type: 'integer', minimum: 500, maximum: 60_000 },
            narration: { type: 'string', minLength: 1, maxLength: 2_000 },
            caption: { type: 'string', minLength: 1, maxLength: 240 },
            visualType: {
              type: 'string',
              enum: [
                'USER_ASSET',
                'APPROVED_ASSET',
                'STOCK_IMAGE',
                'GENERATED_IMAGE',
                'TEXT_MOTION',
              ],
            },
            visualPrompt: { type: ['string', 'null'] },
            keywords: {
              type: 'array',
              maxItems: 20,
              items: { type: 'string', minLength: 1, maxLength: 80 },
            },
            aiProcessingTypes: {
              type: 'array',
              uniqueItems: true,
              items: {
                type: 'string',
                enum: [
                  'SCRIPT_GENERATION',
                  'VOICE_SYNTHESIS',
                  'IMAGE_GENERATION',
                  'AUTOMATIC_ASSET_SELECTION',
                ],
              },
            },
          },
          required: [
            'sceneNo',
            'durationMs',
            'narration',
            'caption',
            'visualType',
            'visualPrompt',
            'keywords',
            'aiProcessingTypes',
          ],
        },
      },
      projectAiProcessingTypes: {
        type: 'array',
        uniqueItems: true,
        items: {
          type: 'string',
          enum: [
            'SCRIPT_GENERATION',
            'VOICE_SYNTHESIS',
            'IMAGE_GENERATION',
            'AUTOMATIC_ASSET_SELECTION',
          ],
        },
      },
    },
    required: ['scenes', 'projectAiProcessingTypes'],
  } as const;
}

export class OpenAIVideoPlanGenerator implements VideoPlanGeneratorPort {
  constructor(private readonly options: { apiKey: string; model?: string; fetch?: typeof fetch }) {}

  async generate(input: VideoPlanGeneratorInput) {
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
              'あなたはワタシワークスの縦型動画企画担当です。渡された本人の分身、対象者、許可済み商品情報、本人素材、承認済み素材だけを使い、日本語の場面構成を作ります。素材は本人素材、承認済み素材、素材写真、生成画像の順で優先します。事実や体験を捏造せず、必須表記と禁止表現を守ってください。30秒は5〜7場面、60秒は8〜12場面とし、durationMsの合計を指定時間と完全一致させ、sceneNoを1から連番にします。標準動画は静止画、字幕、文字の動きで構成し、AI動画生成を使いません。USER_ASSETまたはAPPROVED_ASSETを選ぶ場合は渡されたassetIdをkeywordsへ含めます。AI利用種別は実際に利用するものだけを返します。',
          },
          { role: 'user', content: JSON.stringify(input) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'video_plan',
            strict: true,
            schema: outputSchema(input.project.durationSeconds),
          },
        },
      }),
    });
    const value = (await response.json()) as ResponseValue;
    if (!response.ok)
      throw new ApplicationError('INTERNAL_ERROR', 'video plan provider failed', value.error);
    const text = value.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === 'output_text')?.text;
    if (!text)
      throw new ApplicationError('INTERNAL_ERROR', 'video plan provider returned no output');
    let output: VideoPlanGeneratorOutput;
    try {
      output = JSON.parse(text) as VideoPlanGeneratorOutput;
    } catch (error) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'video plan provider returned invalid output',
        error,
      );
    }
    return {
      output,
      model: value.model ?? model,
      promptVersion: VIDEO_PLAN_PROMPT_VERSION,
      inputTokens: value.usage?.input_tokens ?? null,
      outputTokens: value.usage?.output_tokens ?? null,
      latencyMs: Date.now() - started,
    };
  }
}
