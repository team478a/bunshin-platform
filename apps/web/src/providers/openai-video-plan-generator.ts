import 'server-only';
import type {
  VideoPlanGeneratorInput,
  VideoPlanGeneratorOutput,
  VideoPlanGeneratorPort,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export const VIDEO_PLAN_PROMPT_VERSION = 'video-plan-v4-openai-schema-compatible';

type ResponseValue = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  error?: unknown;
};

function outputSchema(durationSeconds: 25 | 30 | 60, standardComposition: boolean) {
  const minItems = durationSeconds === 60 ? 8 : 5;
  const maxItems = durationSeconds === 60 ? 12 : durationSeconds === 25 ? 5 : 7;
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
            narration: { type: 'string' },
            caption: { type: 'string' },
            visualType: {
              type: 'string',
              enum: ['TEXT_MOTION', ...(standardComposition ? [] : ['AI_VIDEO'])],
            },
            visualPrompt: { type: ['string', 'null'] },
            keywords: {
              type: 'array',
              maxItems: 20,
              items: { type: 'string' },
            },
            aiProcessingTypes: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['SCRIPT_GENERATION', ...(standardComposition ? [] : ['VIDEO_GENERATION'])],
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
        items: {
          type: 'string',
          enum: ['SCRIPT_GENERATION', ...(standardComposition ? [] : ['VIDEO_GENERATION'])],
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
            content: `あなたはワタシワークスの縦型動画企画担当です。渡された本人の分身、対象者、AIキャラクター、許可済み商品情報、本人素材、承認済み素材だけを使い、日本語の場面構成を作ります。AIキャラクターがある場合は見た目・世界観・安全ルールに沿ったvisualPromptを作りますが、実在人物に似せたり、ルール外の設定を追加したりしません。企画ではTEXT_MOTIONとAI_VIDEOだけを返してください。利用者が選んだ写真への置換と、同意済みの音声生成は後段のシステムが行います。narrationは各場面のdurationMs/1000の3倍以下の文字数で短く作ってください。事実や体験を捏造せず、必須表記と禁止表現を守ってください。25秒は5場面、30秒は5〜7場面、60秒は8〜12場面とし、durationMsの合計を指定時間と完全一致させ、sceneNoを1から連番にします。${input.project.standardComposition ? '標準動画は単色背景、字幕、文字の動きで構成します。全場面をTEXT_MOTIONにしてください。' : 'AI動画を使える企画です。AI_VIDEOの場面は必ず5秒または10秒にし、visualPromptとVIDEO_GENERATIONを設定します。不要なAI_VIDEOは使いません。'}AI利用種別は実際に利用するものだけを返します。`,
          },
          { role: 'user', content: JSON.stringify(input) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'video_plan',
            strict: true,
            schema: outputSchema(input.project.durationSeconds, input.project.standardComposition),
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
