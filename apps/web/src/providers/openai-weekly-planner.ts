import 'server-only';
import {
  SOCIAL_PREFERRED_FORMATS,
  type WeeklyPlannerInput,
  type WeeklyPlannerOutput,
  type WeeklyPlannerPort,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

export const WEEKLY_PLANNER_PROMPT_VERSION = 'weekly-planner-v8-goal-outcomes';
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
          businessContentCategory: {
            type: ['string', 'null'],
            enum: [
              'HELPFUL_EXPERTISE',
              'COMPANY_STAFF',
              'FAQ_PROBLEM',
              'CASE_STUDY',
              'PRODUCT_SERVICE',
              null,
            ],
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
          'businessContentCategory',
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
              'あなたは投稿パートナーのSNS週間企画担当です。対象Bunshin、承認済み戦略、Active Content Pillar、Grant済みKnowledge、本人が参加中のCampaignだけを使い、指定週内で実行可能な日本語計画を作成してください。approvedStrategy.goalPlanningは現在のSNS事業目的に対応する型付き方針です。strategyFocusを週全体の中心にし、topicDirectionsから会社情報と対象顧客に合う題材を選び、ctaDirectionsに沿った行動を設計してください。Goal変更時はCTAの末尾だけでなく、strategySummary、各日のgoal、テーマ、angleそのものを変えます。採用目的で一般商品紹介だけを続けるなど、別目的の週間構成にしません。goalKindがINTERMEDIATE_METRICまたはDESTINATIONの場合、それ自体を事業成果と断定せず、承認済み戦略の本文と併せて扱います。scheduledDateはweekStartDateから始まる7日間の日付だけを使い、同じ日を重複させません。同じ週のgoalとangleを重複させません。recentPlanTopicsはこの利用者へ直近4週間に提示した企画です。同じ題材、結論、導入の言い換えを避け、別の具体例・疑問・利用場面へ展開します。contentPillarIdとcampaignIdは入力にあるIDを一字一句そのまま使います。businessContentScheduleがある場合は、その全日付について1件ずつ作り、日付とbusinessContentCategoryを一字一句変えず、指定分類に合う具体的な題材にします。ない場合はbusinessContentCategoryをnullにします。recentPerformanceは直近28日間の本人集計です。GOODが多い形式は無理のない範囲で優先し、BADが多い形式は改善した別角度を選びます。businessOutcomesは本人が記録した問い合わせ・予約・来店・注文などの合計、successfulTopicsは成果が出たテーマです。postPerformance.strongTopicsは投稿別スクリーンショットから確認した反応の強いテーマです。3件以上ある場合だけ傾向として扱い、同じ題材のコピーではなく別の切り口へ展開してください。成果が出たテーマは承認済み戦略と矛盾しない範囲で別の切り口や表現にして次週へ活かします。ただし件数が少ない場合は断定せず、投稿形式やテーマの偏りも避けてください。成果数字は内部の企画判断だけに使い、strategySummary、goal、angle、notesを含む公開用内容へ件数や成果を実績として書かないでください。入力にない効果や因果関係も作りません。通常投稿はORGANICかつcampaignId=nullです。campaignsが空の場合は、商品やサービスに触れる内容も含めて全件をORGANICかつcampaignId=nullにします。campaignsに対象がある場合だけ、商品周辺はPRODUCT_RELATED、直接の商品紹介はADVERTISEMENTとして対象campaignIdを付けます。各Campaignの上限とcooldownDaysを必ず守り、商品投稿だけで週を埋めません。画像・動画そのものや自動投稿は行いません。',
          },
          {
            role: 'system',
            content:
              'recentPerformance.goalEvaluationは現在のGoalと同じGoalで生成された投稿だけの評価条件です。status=MEASUREDの場合だけprimaryOutcomeKeys、businessOutcomes、successfulTopicsを件数実績として使います。SELF_REPORTEDの場合、reportedProgressとreportedPositiveTopicsは本人の手応えとして参考にできますが、外部KPI達成や因果関係として断定しません。NO_DATAは成果未入力であり失敗を意味しません。UNAVAILABLEは現状の取得データではGoal達成を判定できないため、成果を推測せず検証可能な題材を提案します。GOOD・NEUTRAL・BADは内容の好みでありGoal達成ではありません。投稿反応、手入力成果、自己申告、因果関係を混同しません。',
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
