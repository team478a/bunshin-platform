import 'server-only';
import type {
  DailyMissionPlannerOutput,
  DailyMissionPlannerPort,
  DailyMissionPlannerProviderInput,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

export const DAILY_MISSION_PLANNER_PROMPT_VERSION = 'daily-mission-planner-v2';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topic: { type: 'string' },
    angle: { type: 'string' },
    reason: { type: 'string' },
    estimatedMinutes: { type: 'integer' },
  },
  required: ['topic', 'angle', 'reason', 'estimatedMinutes'],
} as const;

type ResponseValue = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  error?: unknown;
};

export class OpenAIDailyMissionPlanner implements DailyMissionPlannerPort {
  constructor(private readonly options: { apiKey: string; model?: string; fetch?: typeof fetch }) {}

  async generate(input: DailyMissionPlannerProviderInput) {
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
              'あなたはBUNSHINのSNS当日企画担当です。確定済み週間計画の対象Itemを、ユーザーが今日実行できるMission Briefにしてください。指定されたBunshin、承認済み戦略、Content Pillar、Grant済みKnowledgeだけを使用します。trendIdeasがある場合は、週間計画と対象者に自然に合うときだけ企画へ反映し、合わない場合は無視してください。トレンドの成果を保証せず、根拠にない事実を追加しないでください。投稿本文、caption、スライド、台本、画像指示、動画Promptは生成せず、topic、angle、reason、estimatedMinutesだけを返してください。estimatedMinutesはavailableMinutes以内にします。',
          },
          { role: 'user', content: JSON.stringify(input) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'daily_mission_brief',
            strict: true,
            schema,
          },
        },
      }),
    });
    const value = (await response.json()) as ResponseValue;
    if (!response.ok)
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'daily mission planner provider failed',
        value.error,
      );
    const text = value.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === 'output_text')?.text;
    if (!text)
      throw new ApplicationError('INTERNAL_ERROR', 'daily mission planner returned no output');

    let output: DailyMissionPlannerOutput;
    try {
      output = JSON.parse(text) as DailyMissionPlannerOutput;
    } catch (error) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'daily mission planner returned invalid output',
        error,
      );
    }
    return {
      output,
      model: value.model ?? model,
      promptVersion: DAILY_MISSION_PLANNER_PROMPT_VERSION,
      inputTokens: value.usage?.input_tokens ?? null,
      outputTokens: value.usage?.output_tokens ?? null,
      latencyMs: Date.now() - started,
    };
  }
}
