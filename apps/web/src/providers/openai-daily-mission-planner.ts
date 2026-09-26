import 'server-only';
import type {
  DailyMissionPlannerOutput,
  DailyMissionPlannerPort,
  DailyMissionPlannerProviderInput,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

export const DAILY_MISSION_PLANNER_PROMPT_VERSION = 'daily-mission-planner-v10-feedback-loop';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topic: { type: 'string' },
    angle: { type: 'string' },
    reason: { type: 'string' },
    estimatedMinutes: { type: 'integer' },
    usedTrendIdea: { type: 'boolean' },
    personalizationSourceTypes: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: {
        type: 'string',
        enum: [
          'BUNSHIN_PROFILE',
          'ONBOARDING_RESPONSE',
          'BUSINESS_PROFILE',
          'SOCIAL_PROFILE',
          'ACCOUNT_STRATEGY',
          'USER_MEMORY',
          'RECENT_ACTIVITY',
          'FEEDBACK_HISTORY',
          'POST_PERFORMANCE',
        ],
      },
    },
    personalizationReason: { type: 'string' },
  },
  required: [
    'topic',
    'angle',
    'reason',
    'estimatedMinutes',
    'usedTrendIdea',
    'personalizationSourceTypes',
    'personalizationReason',
  ],
} as const;

type ResponseValue = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  error?: unknown;
};

const PROVIDER_TIMEOUT_MS = 55_000;

function providerErrorDetails(status: number, error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code.slice(0, 100)
      : null;
  return { provider: 'openai', httpStatus: status, providerErrorCode: code };
}

function unavailable(reason: string, cause?: Record<string, unknown>) {
  return new ApplicationError(
    'AI_PROVIDER_UNAVAILABLE',
    'daily mission planner provider unavailable',
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

export class OpenAIDailyMissionPlanner implements DailyMissionPlannerPort {
  constructor(private readonly options: { apiKey: string; model?: string; fetch?: typeof fetch }) {}

  async generate(input: DailyMissionPlannerProviderInput) {
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
                'あなたは投稿パートナーのSNS当日企画担当です。確定済み週間計画の対象Itemを、ユーザーが今日実行できるMission Briefにしてください。指定されたBunshin、承認済み戦略、Content Pillar、Grant済みKnowledgeだけを使用します。personalization.signalsはこの本人だけの設定・回答・履歴です。共通の商品情報だけで企画を決めず、少なくとも一つのsignalをtopic、angle、具体例、訴求ポイントのいずれかへ意味が分かる形で反映し、reasonにどの本人固有情報を企画判断へ使ったか説明します。FEEDBACK_HISTORYがある場合は本人の低評価・不採用理由を避け、GOODだった要素は同じ原稿を繰り返さず別の疑問・場面・具体例へ発展させます。POST_PERFORMANCEがある場合は一件だけで成果を断定せず、反応があった読者価値を新しい切り口で検証します。実際に使用したsignalのtypeだけをpersonalizationSourceTypesへ列挙し、personalizationReasonへ選定根拠を説明します。入力にないtypeを使用済みとして返してはいけません。ランダム化、語尾、絵文字だけでユーザー差を作りません。businessProfileがある場合は最優先の企画軸です。recentTopicsはこの利用者へ直近7日間に提示した企画です。同じ題材、結論、導入、言い換えだけの企画を避け、別の具体例・疑問・利用場面から組み立てます。weeklyItem.businessContentCategoryがある場合、その分類（HELPFUL_EXPERTISE=役立つ情報・専門知識、COMPANY_STAFF=会社・スタッフの日常、FAQ_PROBLEM=よくある質問・悩み、CASE_STUDY=実績・事例、PRODUCT_SERVICE=商品・サービス）から逸らしません。topicはproductServiceまたはindustryの専門性とtargetAudienceの悩みを直接結びつけ、primaryPurposeに役立つ内容にします。画像を見なくても何についての投稿か分かる、具体的で自己完結したtopicにしてください。登録事業そのものが該当しない限り、集中力、気分転換、習慣化などの一般的な生活・自己啓発テーマへ逸らしません。reasonには登録した商品・サービス、対象者、発信目的のどれに役立つ企画かを明記します。SLIDEまたはIMAGEでは5枚で説明でき、読者が一つ行動できるテーマを選びます。campaignがある場合は本人が参加中の公式企画です。公式facts、rules、assetsだけを商品事実として使い、体験を捏造しません。ADVERTISEMENTでは#PR表記を前提にします。bunshin.personalityがある場合は、その最新版の口調、知識の伝え方、好む表現、避ける表現、顔と声の方針に合う企画にします。trendIdeasがある場合は、週間計画、businessProfile、対象者に自然に合うときだけ企画へ反映し、実際に反映した場合だけusedTrendIdeaをtrueにします。trendIdeasがない、または無視した場合はfalseにします。トレンドの成果を保証せず、根拠にない事実を追加しないでください。投稿本文、caption、スライド、台本、画像指示、動画Promptは生成せず、topic、angle、reason、estimatedMinutes、usedTrendIdea、personalizationSourceTypes、personalizationReasonだけを返してください。estimatedMinutesはavailableMinutes以内にします。',
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
    if (!response.ok) {
      throw new ApplicationError(
        'AI_PROVIDER_UNAVAILABLE',
        'daily mission planner provider failed',
        providerErrorDetails(response.status, value?.error),
      );
    }
    if (!value) throw unavailable(body.trim() ? 'INVALID_JSON' : 'EMPTY_RESPONSE');
    const text = value.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === 'output_text')?.text;
    if (!text) throw unavailable('MALFORMED_RESPONSE');

    let output: DailyMissionPlannerOutput;
    try {
      output = JSON.parse(text) as DailyMissionPlannerOutput;
    } catch {
      throw unavailable('MALFORMED_OUTPUT');
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
