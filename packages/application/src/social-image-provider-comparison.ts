export const SOCIAL_IMAGE_COMPARISON_DATASET_VERSION =
  'SOCIAL_IMAGE_PROVIDER_COMPARISON_SYNTHETIC_V1';
export const SOCIAL_IMAGE_PROVIDER_SELECTION_RULE_VERSION = 'SOCIAL_IMAGE_PROVIDER_SELECTION_V1';

export const SOCIAL_IMAGE_COMPARISON_INDUSTRIES = [
  'BEAUTY_SALON',
  'RESTAURANT',
  'EC_PRODUCT',
  'SERVICE',
] as const;
export type SocialImageComparisonIndustry = (typeof SOCIAL_IMAGE_COMPARISON_INDUSTRIES)[number];
export type SocialImageComparisonProvider = 'OPENAI' | 'XAI';
export type SocialImageProviderFeature = 'TEXT_TO_IMAGE' | 'REFERENCE_IMAGE' | 'PERSON_CONSISTENCY';

export type SocialImageComparisonRating = 1 | 2 | 3 | 4 | 5;

export interface SocialImageComparisonObservation {
  provider: SocialImageComparisonProvider;
  successful: boolean;
  imageQuality: SocialImageComparisonRating;
  japaneseLegibility: SocialImageComparisonRating;
  brandFit: SocialImageComparisonRating;
  personConsistency: SocialImageComparisonRating | null;
  latencyMs: number;
  costUsdMicros: number;
  regenerationRequired: boolean;
  fixtureHeadline: string;
  fixtureDirection: string;
}

export interface SocialImageComparisonCase {
  caseKey: string;
  industry: SocialImageComparisonIndustry;
  title: string;
  purpose: string;
  promptSummary: string;
  requiresReferenceImage: boolean;
  requiresPersonConsistency: boolean;
  observations: readonly [SocialImageComparisonObservation, SocialImageComparisonObservation];
}

type ComparisonCaseSeed = Omit<SocialImageComparisonCase, 'observations'> & {
  headline: string;
  direction: string;
};

const cases: readonly ComparisonCaseSeed[] = [
  {
    caseKey: 'beauty-new-customer',
    industry: 'BEAUTY_SALON',
    title: '新規来店キャンペーン',
    purpose: '初回来店の予約獲得',
    promptSummary: '明るい店内と自然なヘアスタイル。料金文字を後から載せられる余白を確保する。',
    requiresReferenceImage: false,
    requiresPersonConsistency: false,
    headline: 'はじめての方へ',
    direction: '明るいベージュ、自然光、右上に文字余白',
  },
  {
    caseKey: 'beauty-color-menu',
    industry: 'BEAUTY_SALON',
    title: '季節のヘアカラー',
    purpose: 'カラーメニューの認知',
    promptSummary: '透明感のある髪色を主役にし、施術名の文字領域を下部に残す。',
    requiresReferenceImage: true,
    requiresPersonConsistency: true,
    headline: '秋の透明感カラー',
    direction: 'くすみピンク、髪の質感を優先、人物を統一',
  },
  {
    caseKey: 'beauty-staff',
    industry: 'BEAUTY_SALON',
    title: 'スタッフ紹介',
    purpose: '担当者への安心感',
    promptSummary: '同じスタッフ写真を参照し、清潔感あるプロフィール画像に整える。',
    requiresReferenceImage: true,
    requiresPersonConsistency: true,
    headline: 'スタイリスト紹介',
    direction: '白背景、柔らかい光、顔立ちを変えない',
  },
  {
    caseKey: 'beauty-care-tip',
    industry: 'BEAUTY_SALON',
    title: 'ホームケア解説',
    purpose: '保存される情報投稿',
    promptSummary: 'ヘアケア用品と手順を分かりやすく見せ、番号文字を合成する余白を作る。',
    requiresReferenceImage: false,
    requiresPersonConsistency: false,
    headline: '朝の3分ケア',
    direction: '清潔な洗面台、3ステップ、余白を広く',
  },
  {
    caseKey: 'beauty-product',
    industry: 'BEAUTY_SALON',
    title: '店販商品の紹介',
    purpose: '店頭商品の購入促進',
    promptSummary: '提供された商品画像を変形せず、サロンの色調に合わせた背景へ配置する。',
    requiresReferenceImage: true,
    requiresPersonConsistency: false,
    headline: '髪に、毎日のごほうび',
    direction: '商品ラベルを保持、石と植物、上品な影',
  },
  {
    caseKey: 'restaurant-lunch',
    industry: 'RESTAURANT',
    title: 'ランチメニュー',
    purpose: '平日ランチの来店促進',
    promptSummary: '主菜の湯気と量感を見せ、価格は既存テンプレートで合成できる構図にする。',
    requiresReferenceImage: true,
    requiresPersonConsistency: false,
    headline: '今日のおすすめランチ',
    direction: '俯瞰、温かい光、料理写真を忠実に保持',
  },
  {
    caseKey: 'restaurant-seasonal',
    industry: 'RESTAURANT',
    title: '季節限定メニュー',
    purpose: '限定商品の訴求',
    promptSummary: '季節感を背景小物で表現し、料理そのものは参照画像に合わせる。',
    requiresReferenceImage: true,
    requiresPersonConsistency: false,
    headline: '秋だけの一皿',
    direction: '紅葉色、深い木目、料理の形を変えない',
  },
  {
    caseKey: 'restaurant-chef',
    industry: 'RESTAURANT',
    title: '料理人のこだわり',
    purpose: '店舗ストーリーの発信',
    promptSummary: '調理中の人物を一貫させ、手元と食材が自然に見えるドキュメンタリー調。',
    requiresReferenceImage: true,
    requiresPersonConsistency: true,
    headline: '一皿に込めること',
    direction: '厨房の逆光、手元中心、同じ料理人',
  },
  {
    caseKey: 'restaurant-takeout',
    industry: 'RESTAURANT',
    title: 'テイクアウト案内',
    purpose: '持ち帰り注文の獲得',
    promptSummary: '容器入りの商品を清潔に見せ、注文方法の文字領域を十分に残す。',
    requiresReferenceImage: false,
    requiresPersonConsistency: false,
    headline: 'おうちで楽しむ味',
    direction: '明るい卓上、容器と料理、左側に文字余白',
  },
  {
    caseKey: 'restaurant-interior',
    industry: 'RESTAURANT',
    title: '店内・席の紹介',
    purpose: '利用シーンの提案',
    promptSummary: '店内写真を参考に、席間や照明の雰囲気を誇張せず伝える。',
    requiresReferenceImage: true,
    requiresPersonConsistency: false,
    headline: 'ゆっくり過ごす夜',
    direction: '店内構造を保持、暖色照明、過度に豪華にしない',
  },
  {
    caseKey: 'ec-hero',
    industry: 'EC_PRODUCT',
    title: '商品メインビジュアル',
    purpose: '商品ページへの誘導',
    promptSummary: '商品パッケージとロゴを保持し、ブランドカラーの背景で中央配置する。',
    requiresReferenceImage: true,
    requiresPersonConsistency: false,
    headline: '毎日に、心地よい選択',
    direction: '商品中央、ブランド色、ラベルを変えない',
  },
  {
    caseKey: 'ec-use-scene',
    industry: 'EC_PRODUCT',
    title: '利用シーン',
    purpose: '使用後のイメージ訴求',
    promptSummary: '商品を使う自然な生活場面。手指や商品のサイズ感を破綻させない。',
    requiresReferenceImage: true,
    requiresPersonConsistency: false,
    headline: '暮らしになじむ',
    direction: '朝の室内、自然な手元、実物の縮尺を保持',
  },
  {
    caseKey: 'ec-detail',
    industry: 'EC_PRODUCT',
    title: '素材・ディテール',
    purpose: '品質の説明',
    promptSummary: '商品の素材感と細部を接写し、説明ラベル用の領域を設ける。',
    requiresReferenceImage: true,
    requiresPersonConsistency: false,
    headline: '細部まで、ていねいに',
    direction: 'マクロ撮影、質感優先、右側に注釈余白',
  },
  {
    caseKey: 'ec-gift',
    industry: 'EC_PRODUCT',
    title: 'ギフト提案',
    purpose: '贈答需要の獲得',
    promptSummary: '商品と包装を参照し、贈る場面を上品に演出する。',
    requiresReferenceImage: true,
    requiresPersonConsistency: false,
    headline: '大切な人へ',
    direction: '包装を保持、落ち着いた祝祭感、余白多め',
  },
  {
    caseKey: 'ec-review',
    industry: 'EC_PRODUCT',
    title: '購入者レビュー紹介',
    purpose: '購入前の不安解消',
    promptSummary: '商品を背景に置き、レビュー本文は文字合成で読みやすく配置できるようにする。',
    requiresReferenceImage: true,
    requiresPersonConsistency: false,
    headline: 'お客様の声',
    direction: '商品は控えめ、中央に広い文字面、星は生成しない',
  },
  {
    caseKey: 'service-introduction',
    industry: 'SERVICE',
    title: 'サービス紹介',
    purpose: 'サービス内容の理解',
    promptSummary: '抽象的なサービス価値を人物と図形で表し、説明文の領域を確保する。',
    requiresReferenceImage: false,
    requiresPersonConsistency: false,
    headline: '仕事を、もっとシンプルに',
    direction: '青と白、落ち着いた人物、図形は最小限',
  },
  {
    caseKey: 'service-before-after',
    industry: 'SERVICE',
    title: '導入前後の変化',
    purpose: '導入効果の説明',
    promptSummary: '左右の対比が明確な構図。数値や効果は画像生成せずテンプレートで合成する。',
    requiresReferenceImage: false,
    requiresPersonConsistency: true,
    headline: '変わる、毎日の仕事',
    direction: '同じ人物、左右分割、誇張表現を避ける',
  },
  {
    caseKey: 'service-case-study',
    industry: 'SERVICE',
    title: '導入事例',
    purpose: '信頼性の向上',
    promptSummary: '提供された担当者写真を保ち、事例タイトルを載せられるビジネス向け構図。',
    requiresReferenceImage: true,
    requiresPersonConsistency: true,
    headline: '導入事例',
    direction: '人物を保持、端正な背景、ロゴ用の安全領域',
  },
  {
    caseKey: 'service-event',
    industry: 'SERVICE',
    title: '相談会・イベント告知',
    purpose: '申込獲得',
    promptSummary: '日時や会場は後から文字合成し、イベントの雰囲気だけを画像で表す。',
    requiresReferenceImage: false,
    requiresPersonConsistency: false,
    headline: '無料相談会',
    direction: '親しみある対話風景、下半分に文字領域',
  },
  {
    caseKey: 'service-faq',
    industry: 'SERVICE',
    title: 'よくある質問',
    purpose: '検討者の不安解消',
    promptSummary: '落ち着いた案内役とシンプルな背景。質問文は既存テンプレートで合成する。',
    requiresReferenceImage: false,
    requiresPersonConsistency: true,
    headline: 'よくある質問',
    direction: '同じ案内役、白い背景、吹き出しは空欄',
  },
] as const;

const clampRating = (value: number): SocialImageComparisonRating =>
  Math.max(1, Math.min(5, value)) as SocialImageComparisonRating;

export const SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES: readonly SocialImageComparisonCase[] =
  Object.freeze(
    cases.map((item, index) => {
      const hasPerson = item.requiresPersonConsistency;
      const openAiBias = index % 4 === 0 ? 1 : 0;
      const xAiBias = index % 4 === 2 ? 1 : 0;
      const observations: [SocialImageComparisonObservation, SocialImageComparisonObservation] = [
        {
          provider: 'OPENAI',
          successful: index !== 13,
          imageQuality: clampRating(4 + openAiBias),
          japaneseLegibility: clampRating(4 + (index % 5 === 0 ? 1 : 0)),
          brandFit: clampRating(4 + openAiBias),
          personConsistency: hasPerson ? clampRating(3 + openAiBias) : null,
          latencyMs: 7_800 + index * 190,
          costUsdMicros: 80_000,
          regenerationRequired: index === 7 || index === 13,
          fixtureHeadline: item.headline,
          fixtureDirection: item.direction,
        },
        {
          provider: 'XAI',
          successful: index !== 4,
          imageQuality: clampRating(4 + xAiBias),
          japaneseLegibility: clampRating(3 + (index % 5 === 1 ? 1 : 0)),
          brandFit: clampRating(3 + xAiBias),
          personConsistency: hasPerson ? clampRating(4 + xAiBias) : null,
          latencyMs: 6_200 + index * 160,
          costUsdMicros: item.requiresReferenceImage ? 70_000 : 60_000,
          regenerationRequired: index === 4 || index === 16 || index === 19,
          fixtureHeadline: item.headline,
          fixtureDirection: item.direction,
        },
      ];
      return {
        ...item,
        observations,
      };
    }),
  );

export interface SocialImageProviderAggregate {
  provider: SocialImageComparisonProvider;
  caseCount: number;
  successfulCases: number;
  successRate: number;
  averageImageQuality: number;
  averageJapaneseLegibility: number;
  averageBrandFit: number;
  averagePersonConsistency: number | null;
  averageQualityScore: number;
  averageLatencyMs: number;
  averageCostUsdMicros: number;
  regenerationRate: number;
}

const rounded = (value: number, digits = 2) => Number(value.toFixed(digits));
const average = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;

export function aggregateSocialImageProviderComparison(
  input: readonly SocialImageComparisonCase[],
): readonly SocialImageProviderAggregate[] {
  return (['OPENAI', 'XAI'] as const).map((provider) => {
    const rows = input.flatMap((item) =>
      item.observations.filter((observation) => observation.provider === provider),
    );
    const successful = rows.filter((row) => row.successful);
    const personRatings = successful.flatMap((row) =>
      row.personConsistency === null ? [] : [row.personConsistency],
    );
    return {
      provider,
      caseCount: rows.length,
      successfulCases: successful.length,
      successRate: rounded((successful.length / Math.max(1, rows.length)) * 100, 1),
      averageImageQuality: rounded(average(successful.map((row) => row.imageQuality))),
      averageJapaneseLegibility: rounded(average(successful.map((row) => row.japaneseLegibility))),
      averageBrandFit: rounded(average(successful.map((row) => row.brandFit))),
      averagePersonConsistency: personRatings.length === 0 ? null : rounded(average(personRatings)),
      averageQualityScore: rounded(
        average(
          successful.map((row) =>
            average(
              [row.imageQuality, row.japaneseLegibility, row.brandFit].concat(
                row.personConsistency === null ? [] : [row.personConsistency],
              ),
            ),
          ),
        ),
      ),
      averageLatencyMs: Math.round(average(successful.map((row) => row.latencyMs))),
      averageCostUsdMicros: Math.round(average(successful.map((row) => row.costUsdMicros))),
      regenerationRate: rounded(
        (rows.filter((row) => row.regenerationRequired).length / Math.max(1, rows.length)) * 100,
        1,
      ),
    };
  });
}

export interface SocialImageProviderSelectionCandidate extends SocialImageProviderAggregate {
  active: boolean;
  configured: boolean;
  features: readonly SocialImageProviderFeature[];
}

export interface SocialImageProviderSelectionRequirements {
  requiredFeatures: readonly SocialImageProviderFeature[];
  maximumCostUsdMicros: number;
  minimumQualityScore: number;
  minimumSuccessRate: number;
}

export type SocialImageProviderRejectionReason =
  | 'STOPPED'
  | 'NOT_CONFIGURED'
  | 'FEATURE_UNSUPPORTED'
  | 'COST_LIMIT_EXCEEDED'
  | 'QUALITY_BELOW_MINIMUM'
  | 'SUCCESS_RATE_BELOW_MINIMUM';

export interface SocialImageProviderSelectionResult {
  ruleVersion: typeof SOCIAL_IMAGE_PROVIDER_SELECTION_RULE_VERSION;
  selectedProvider: SocialImageComparisonProvider | null;
  eligibleProviders: readonly SocialImageComparisonProvider[];
  rejected: ReadonlyArray<{
    provider: SocialImageComparisonProvider;
    reasons: readonly SocialImageProviderRejectionReason[];
  }>;
}

export function selectSocialImageProvider(
  candidates: readonly SocialImageProviderSelectionCandidate[],
  requirements: SocialImageProviderSelectionRequirements,
): SocialImageProviderSelectionResult {
  const evaluated = candidates.map((candidate) => {
    const reasons: SocialImageProviderRejectionReason[] = [];
    if (!candidate.active) reasons.push('STOPPED');
    if (!candidate.configured) reasons.push('NOT_CONFIGURED');
    if (requirements.requiredFeatures.some((feature) => !candidate.features.includes(feature)))
      reasons.push('FEATURE_UNSUPPORTED');
    if (candidate.averageCostUsdMicros > requirements.maximumCostUsdMicros)
      reasons.push('COST_LIMIT_EXCEEDED');
    if (candidate.averageQualityScore < requirements.minimumQualityScore)
      reasons.push('QUALITY_BELOW_MINIMUM');
    if (candidate.successRate < requirements.minimumSuccessRate)
      reasons.push('SUCCESS_RATE_BELOW_MINIMUM');
    return { candidate, reasons };
  });
  const eligible = evaluated
    .filter((item) => item.reasons.length === 0)
    .map((item) => item.candidate)
    .sort(
      (left, right) =>
        right.averageQualityScore - left.averageQualityScore ||
        right.successRate - left.successRate ||
        left.regenerationRate - right.regenerationRate ||
        left.averageCostUsdMicros - right.averageCostUsdMicros ||
        left.averageLatencyMs - right.averageLatencyMs ||
        left.provider.localeCompare(right.provider),
    );
  return {
    ruleVersion: SOCIAL_IMAGE_PROVIDER_SELECTION_RULE_VERSION,
    selectedProvider: eligible[0]?.provider ?? null,
    eligibleProviders: eligible.map((candidate) => candidate.provider),
    rejected: evaluated
      .filter((item) => item.reasons.length > 0)
      .map((item) => ({ provider: item.candidate.provider, reasons: item.reasons })),
  };
}
