import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  weeklySocialGoalPlanningProfile,
  type SocialAccountStrategyGoal,
} from '@bunshin/capability-social';
import { describe, expect, it } from 'vitest';

type PrimaryGoal = Extract<
  SocialAccountStrategyGoal,
  | 'BRAND_AWARENESS'
  | 'VISIT_RESERVATION'
  | 'INQUIRY'
  | 'REPEAT'
  | 'RECRUIT'
  | 'SALES'
  | 'TRUST_EXPERTISE'
>;

interface DifferentialOutputFixture {
  goal: PrimaryGoal;
  strategySummary: string;
  weeklyTheme: string;
  topic: string;
  recommendationReason: string;
  body: string;
  visualIdea: string;
  cta: string;
}

const visualTerms: Record<PrimaryGoal, readonly string[]> = {
  BRAND_AWARENESS: ['カウンセリング', 'スタッフ', '店内'],
  VISIT_RESERVATION: ['入口', '受付', '施術席'],
  INQUIRY: ['相談', '質問', '悩み'],
  REPEAT: ['自宅ケア', 'ブラシ', 'ヘアケア'],
  RECRUIT: ['働くスタッフ', '朝礼', '施術準備'],
  SALES: ['商品', '使用量', 'パッケージ'],
  TRUST_EXPERTISE: ['カラー剤', '選定', 'カウンセリングシート'],
};

const rubricTerms: Record<PrimaryGoal, { theme: readonly string[]; cta: readonly string[] }> = {
  BRAND_AWARENESS: {
    theme: ['特徴', '考え方', 'スタッフ', 'カウンセリング'],
    cta: ['フォロー', '保存', '詳細'],
  },
  VISIT_RESERVATION: {
    theme: ['初回来店', '来店', '予約', '受付'],
    cta: ['予約', '空き状況', '来店方法'],
  },
  INQUIRY: {
    theme: ['課題', 'FAQ', '悩み', '相談', '質問'],
    cta: ['問い合わせ', '相談', 'LINE'],
  },
  REPEAT: {
    theme: ['アフターケア', '自宅ケア', '再利用', '次回来店', '再予約'],
    cta: ['再予約', '次回来店'],
  },
  RECRUIT: {
    theme: ['スタッフ', '職場', '仕事内容', '仕事', '朝礼', 'キャリア'],
    cta: ['採用情報', '応募', '見学'],
  },
  SALES: {
    theme: ['商品', '使用場面', '比較', '購入', '使用量'],
    cta: ['商品を見る', '購入', '問い合わせ'],
  },
  TRUST_EXPERTISE: {
    theme: ['専門知識', 'プロセス', '判断根拠', '選定'],
    cta: ['保存', '詳細', '相談'],
  },
};

const fixtures: DifferentialOutputFixture[] = [
  {
    goal: 'BRAND_AWARENESS',
    strategySummary: '会社・店舗を知る理由と記憶に残る特徴を伝える',
    weeklyTheme: '会社・店舗の特徴として、カウンセリングで大切にしている考え方を伝える',
    topic: '初めて知る方へ、カウンセリングで大切にしていること',
    recommendationReason: '店の考え方とスタッフの姿勢を知ってもらうため',
    body: '希望を言葉にしにくい方にも、写真を一緒に見ながら確認する当店の特徴を紹介します。',
    visualIdea: 'スタッフがお客様とヘア写真を見ながらカウンセリングする店内の様子',
    cta: 'あとで見返せるよう保存し、今後の髪のお悩み情報をフォローしてください。',
  },
  {
    goal: 'VISIT_RESERVATION',
    strategySummary: '初回来店や予約前の不安を解消し、利用場面を具体化する',
    weeklyTheme: '初回来店の流れと店舗情報を順番に案内する',
    topic: '初回来店前に知っておきたい、受付から施術までの流れ',
    recommendationReason: '来店前の不安を減らし、予約後の利用場面を想像できるため',
    body: '入口での受付、希望の確認、施術席へのご案内までを順番に紹介します。',
    visualIdea: '店舗の入口、受付、施術席を来店順に並べた3場面',
    cta: '希望の日の空き状況を確認して予約してください。',
  },
  {
    goal: 'INQUIRY',
    strategySummary: '対象顧客の課題を具体化し、相談前の不安を解消する',
    weeklyTheme: '顧客の課題とよくある質問を、相談テーマごとに説明する',
    topic: 'カラー前によくある髪の悩み3つと相談時に伝えること',
    recommendationReason: 'FAQを先に示し、何を問い合わせればよいか分かるため',
    body: '色落ち、白髪、頭皮への不安について、相談時に確認する内容を紹介します。',
    visualIdea: '髪の悩みを質問カードに書き、スタッフへ相談している手元',
    cta: '当てはまる悩みがあればLINEで質問してください。',
  },
  {
    goal: 'REPEAT',
    strategySummary: '既存顧客が再利用する具体的な理由と時期を伝える',
    weeklyTheme: 'アフターケアと次回来店までの過ごし方を伝える',
    topic: '次回来店まで髪の状態を保つ、自宅ケア3つ',
    recommendationReason: '施術後のアフターケアと再利用理由を具体化できるため',
    body: '乾かす順番、ブラシの使い方、ヘアケアの量を次回来店の目安と一緒に紹介します。',
    visualIdea: '自宅ケアで使うブラシとヘアケア用品を洗面台に並べた手元',
    cta: '髪の状態に合わせて次回来店を確認し、再予約してください。',
  },
  {
    goal: 'RECRUIT',
    strategySummary: '働く人と仕事の実像を伝え、応募前の不安を解消する',
    weeklyTheme: 'スタッフの一日の仕事と職場環境を具体的に見せる',
    topic: '入社1年目のスタッフはどんな一日を過ごしている？',
    recommendationReason: '仕事内容、働く人、キャリアを応募前に理解できるため',
    body: '朝礼、施術準備、先輩との練習まで、若手スタッフの一日の仕事を紹介します。',
    visualIdea: '働くスタッフの朝礼、施術準備、先輩との練習の3場面',
    cta: '職場を知りたい方は採用情報を見て、見学を相談してください。',
  },
  {
    goal: 'SALES',
    strategySummary: '商品・サービスの価値と購入判断に必要な情報を伝える',
    weeklyTheme: '商品の使用場面と選び方を比較して伝える',
    topic: '髪質別に選ぶ、洗い流さないヘアケア商品の違い',
    recommendationReason: '商品価値、使用場面、購入理由を自分の髪質で判断できるため',
    body: '細い髪と広がりやすい髪で、商品の使用量と仕上がりの違いを比較します。',
    visualIdea: '2種類の商品パッケージと髪質別の使用量を並べた比較写真',
    cta: '自分に合う商品を見るか、購入前に問い合わせてください。',
  },
  {
    goal: 'TRUST_EXPERTISE',
    strategySummary: '実績・専門知識・仕事のプロセスを根拠付きで伝える',
    weeklyTheme: '専門知識と仕事のプロセスを、判断理由とともに伝える',
    topic: '髪の状態に合わせてカラー剤を選定するプロセス',
    recommendationReason: '専門知識だけでなく、仕事のプロセスと判断根拠が伝わるため',
    body: '履歴、現在の明るさ、希望色をカウンセリングシートで確認して選定します。',
    visualIdea: 'カラー剤の選定表と記入済みカウンセリングシートを確認する手元',
    cta: '選び方を保存し、自分の場合を詳しく知りたい方は相談してください。',
  },
];

function includesAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

function evaluate(fixture: DifferentialOutputFixture) {
  const policy = weeklySocialGoalPlanningProfile(fixture.goal);
  const terms = rubricTerms[fixture.goal];
  return {
    strategy: fixture.strategySummary.includes(policy.strategyFocus),
    weeklyTheme: includesAny(fixture.weeklyTheme, terms.theme),
    topic: includesAny(fixture.topic, terms.theme),
    recommendationReason: includesAny(fixture.recommendationReason, terms.theme),
    body: includesAny(fixture.body, terms.theme),
    visualIdea: includesAny(fixture.visualIdea, visualTerms[fixture.goal]),
    cta: includesAny(fixture.cta, terms.cta),
  };
}

describe('Hassy Goal Differential output rubric', () => {
  it.each(fixtures)(
    '$goal changes strategy, theme, content, visual and CTA as one structure',
    (fixture) => {
      expect(evaluate(fixture)).toEqual({
        strategy: true,
        weeklyTheme: true,
        topic: true,
        recommendationReason: true,
        body: true,
        visualIdea: true,
        cta: true,
      });
    },
  );

  it('keeps the seven primary-goal themes structurally distinct', () => {
    expect(new Set(fixtures.map(({ weeklyTheme, topic }) => `${weeklyTheme}\n${topic}`)).size).toBe(
      fixtures.length,
    );
  });

  it.each(fixtures)(
    '$goal rubric remains grounded in the versioned planning policy',
    ({ goal }) => {
      const policy = weeklySocialGoalPlanningProfile(goal);
      expect(includesAny(policy.topicDirections.join('\n'), rubricTerms[goal].theme)).toBe(true);
      expect(includesAny(policy.ctaDirections.join('\n'), rubricTerms[goal].cta)).toBe(true);
    },
  );

  it.each(fixtures.filter(({ goal }) => goal !== 'BRAND_AWARENESS'))(
    'rejects an awareness post with only its CTA changed to $goal',
    ({ goal, cta }) => {
      const awareness = fixtures[0]!;
      const result = evaluate({ ...awareness, goal, cta });
      expect(result.cta).toBe(true);
      expect(
        Object.entries(result).filter(([key, passed]) => key !== 'cta' && !passed).length,
      ).toBeGreaterThanOrEqual(4);
    },
  );

  it('rejects inquiry-shaped content even when its CTA is changed to a sales inquiry', () => {
    const inquiry = fixtures.find(({ goal }) => goal === 'INQUIRY')!;
    const result = evaluate({
      ...inquiry,
      goal: 'SALES',
      cta: '購入前に問い合わせてください。',
    });

    expect(result.cta).toBe(true);
    expect(result.weeklyTheme).toBe(false);
    expect(result.topic).toBe(false);
    expect(result.body).toBe(false);
    expect(result.visualIdea).toBe(false);
  });

  it('locks the no-CTA-only rule into every generation and quality prompt', async () => {
    const paths = [
      '../src/providers/openai-weekly-planner.ts',
      '../src/providers/openai-daily-mission-planner.ts',
      '../src/providers/openai-mission-content-generator.ts',
      '../src/providers/openai-mission-quality-checker.ts',
    ];
    const sources = await Promise.all(
      paths.map((path) => readFile(fileURLToPath(new URL(path, import.meta.url)), 'utf8')),
    );

    for (const source of sources) {
      expect(source).toContain('approvedStrategy.goalPlanning');
      expect(source).toContain('CTAの末尾だけ');
    }
    expect(sources[3]).toContain('GOAL_MISMATCH');
    expect(sources[2]).toContain('canonicalGoalがSALESの場合');
    expect(sources[2]).toContain('初回来店の一般的な不安解消');
    expect(sources[3]).toContain('canonicalGoalがSALESの場合');
    expect(sources[3]).toContain('INQUIRY寄り');
  });
});
