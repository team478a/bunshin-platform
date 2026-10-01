import type {
  SocialAccountStrategyDestination,
  SocialAccountStrategyGoal,
} from './social-account-strategy';

/**
 * Business outcomes that SOCIAL planning may optimize for.
 *
 * These are intentionally separate from destinations and intermediate metrics
 * such as followers, LINE registrations, and blog traffic.
 */
export const CANONICAL_SOCIAL_GOALS = [
  'AWARENESS',
  'VISIT_RESERVATION',
  'INQUIRY',
  'REPEAT',
  'RECRUITMENT',
  'SALES',
  'TRUST_EXPERTISE',
  'OTHER',
] as const;

export type CanonicalSocialGoal = (typeof CANONICAL_SOCIAL_GOALS)[number];

/** Existing values accepted by service business-profile onboarding. */
export const SERVICE_BUSINESS_PURPOSES = [
  'ATTRACT',
  'RESERVATION',
  'SALES',
  'RECRUITING',
  'AWARENESS',
  'RETENTION',
] as const;

export type ServiceBusinessPurpose = (typeof SERVICE_BUSINESS_PURPOSES)[number];

export function isServiceBusinessPurpose(value: string): value is ServiceBusinessPurpose {
  return SERVICE_BUSINESS_PURPOSES.some((purpose) => purpose === value);
}

export type SocialGoalMappingReviewReason =
  | 'BUSINESS_PURPOSE_TOO_BROAD'
  | 'INTERMEDIATE_METRIC_IS_NOT_BUSINESS_GOAL'
  | 'DESTINATION_IS_NOT_BUSINESS_GOAL';

export type CanonicalSocialGoalMapping =
  | {
      status: 'RESOLVED';
      goal: CanonicalSocialGoal;
    }
  | {
      status: 'REVIEW_REQUIRED';
      candidates: readonly CanonicalSocialGoal[];
      reason: SocialGoalMappingReviewReason;
    };

const businessPurposeMappings = {
  ATTRACT: {
    status: 'REVIEW_REQUIRED',
    candidates: ['VISIT_RESERVATION', 'INQUIRY', 'SALES'],
    reason: 'BUSINESS_PURPOSE_TOO_BROAD',
  },
  RESERVATION: { status: 'RESOLVED', goal: 'VISIT_RESERVATION' },
  SALES: { status: 'RESOLVED', goal: 'SALES' },
  RECRUITING: { status: 'RESOLVED', goal: 'RECRUITMENT' },
  AWARENESS: { status: 'RESOLVED', goal: 'AWARENESS' },
  RETENTION: { status: 'RESOLVED', goal: 'REPEAT' },
} as const satisfies Record<ServiceBusinessPurpose, CanonicalSocialGoalMapping>;

const accountStrategyGoalMappings = {
  FOLLOWERS: {
    status: 'REVIEW_REQUIRED',
    candidates: ['AWARENESS', 'TRUST_EXPERTISE'],
    reason: 'INTERMEDIATE_METRIC_IS_NOT_BUSINESS_GOAL',
  },
  LINE_REGISTRATION: {
    status: 'REVIEW_REQUIRED',
    candidates: ['INQUIRY', 'VISIT_RESERVATION', 'SALES'],
    reason: 'DESTINATION_IS_NOT_BUSINESS_GOAL',
  },
  INQUIRY: { status: 'RESOLVED', goal: 'INQUIRY' },
  VISIT_RESERVATION: { status: 'RESOLVED', goal: 'VISIT_RESERVATION' },
  SALES: { status: 'RESOLVED', goal: 'SALES' },
  RECRUIT: { status: 'RESOLVED', goal: 'RECRUITMENT' },
  REPEAT: { status: 'RESOLVED', goal: 'REPEAT' },
  BRAND_AWARENESS: { status: 'RESOLVED', goal: 'AWARENESS' },
  TRUST_EXPERTISE: { status: 'RESOLVED', goal: 'TRUST_EXPERTISE' },
  BLOG_TRAFFIC: {
    status: 'REVIEW_REQUIRED',
    candidates: ['AWARENESS', 'TRUST_EXPERTISE', 'INQUIRY'],
    reason: 'DESTINATION_IS_NOT_BUSINESS_GOAL',
  },
  OTHER: { status: 'RESOLVED', goal: 'OTHER' },
} as const satisfies Record<SocialAccountStrategyGoal, CanonicalSocialGoalMapping>;

export function canonicalGoalFromBusinessPurpose(
  purpose: ServiceBusinessPurpose,
): CanonicalSocialGoalMapping {
  return businessPurposeMappings[purpose];
}

export function canonicalGoalFromAccountStrategy(
  goal: SocialAccountStrategyGoal,
): CanonicalSocialGoalMapping {
  return accountStrategyGoalMappings[goal];
}

export type InitialSocialAccountStrategyGoal =
  | {
      status: 'RESOLVED';
      goal: SocialAccountStrategyGoal;
      destinationType: SocialAccountStrategyDestination;
    }
  | {
      status: 'REVIEW_REQUIRED';
      candidates: readonly SocialAccountStrategyGoal[];
      reason: 'BUSINESS_PURPOSE_TOO_BROAD';
    };

const initialStrategyGoals = {
  ATTRACT: {
    status: 'REVIEW_REQUIRED',
    candidates: ['VISIT_RESERVATION', 'INQUIRY', 'SALES'],
    reason: 'BUSINESS_PURPOSE_TOO_BROAD',
  },
  RESERVATION: {
    status: 'RESOLVED',
    goal: 'VISIT_RESERVATION',
    destinationType: 'NONE',
  },
  SALES: { status: 'RESOLVED', goal: 'SALES', destinationType: 'NONE' },
  RECRUITING: { status: 'RESOLVED', goal: 'RECRUIT', destinationType: 'NONE' },
  AWARENESS: {
    status: 'RESOLVED',
    goal: 'BRAND_AWARENESS',
    destinationType: 'PROFILE',
  },
  RETENTION: { status: 'RESOLVED', goal: 'REPEAT', destinationType: 'NONE' },
} as const satisfies Record<ServiceBusinessPurpose, InitialSocialAccountStrategyGoal>;

/**
 * Resolves the business-profile purpose used by the service onboarding into the
 * first account strategy. A broad ATTRACT purpose deliberately remains a user
 * decision instead of being silently collapsed into one conversion outcome.
 */
export function initialSocialAccountStrategyGoal(
  purpose: ServiceBusinessPurpose,
): InitialSocialAccountStrategyGoal {
  return initialStrategyGoals[purpose];
}

export interface WeeklySocialGoalPlanningProfile {
  goalKind: 'BUSINESS_OUTCOME' | 'INTERMEDIATE_METRIC' | 'DESTINATION' | 'CUSTOM';
  canonicalGoal: CanonicalSocialGoal | null;
  strategyFocus: string;
  topicDirections: readonly string[];
  ctaDirections: readonly string[];
}

export type SocialGoalPlanningProfile = WeeklySocialGoalPlanningProfile;

const weeklyPlanningProfiles = {
  FOLLOWERS: {
    goalKind: 'INTERMEDIATE_METRIC',
    canonicalGoal: null,
    strategyFocus: 'フォローする理由が伝わる継続的な読者価値を作る',
    topicDirections: ['専門性', '継続して得られる情報', '発信者の考え方'],
    ctaDirections: ['フォロー', '保存'],
  },
  LINE_REGISTRATION: {
    goalKind: 'DESTINATION',
    canonicalGoal: null,
    strategyFocus: 'LINE登録後に得られる具体的な価値を誇張なく伝える',
    topicDirections: ['登録後の案内内容', '相談や予約までの流れ', 'よくある質問'],
    ctaDirections: ['LINEで詳細を見る', 'LINEで相談する'],
  },
  INQUIRY: {
    goalKind: 'BUSINESS_OUTCOME',
    canonicalGoal: 'INQUIRY',
    strategyFocus: '対象顧客の課題を具体化し、相談前の不安を解消する',
    topicDirections: ['顧客の課題', 'FAQ', '解決方法', '事例', '相談テーマ'],
    ctaDirections: ['問い合わせる', '相談する', 'LINEで質問する'],
  },
  VISIT_RESERVATION: {
    goalKind: 'BUSINESS_OUTCOME',
    canonicalGoal: 'VISIT_RESERVATION',
    strategyFocus: '初回来店や予約前の不安を解消し、利用場面を具体化する',
    topicDirections: ['利用場面', '初回来店の流れ', 'メニュー', '事例', '店舗情報'],
    ctaDirections: ['予約する', '空き状況を確認する', '来店方法を見る'],
  },
  SALES: {
    goalKind: 'BUSINESS_OUTCOME',
    canonicalGoal: 'SALES',
    strategyFocus: '商品・サービスの価値と購入判断に必要な情報を伝える',
    topicDirections: ['商品価値', '使用場面', '比較', '利用事例', 'FAQ', '購入理由'],
    ctaDirections: ['商品を見る', '購入する', '問い合わせる'],
  },
  RECRUIT: {
    goalKind: 'BUSINESS_OUTCOME',
    canonicalGoal: 'RECRUITMENT',
    strategyFocus: '働く人と仕事の実像を伝え、応募前の不安を解消する',
    topicDirections: ['スタッフ', '職場環境', '仕事内容', '価値観', '一日の仕事', 'キャリア'],
    ctaDirections: ['採用情報を見る', '応募する', '見学を相談する'],
  },
  REPEAT: {
    goalKind: 'BUSINESS_OUTCOME',
    canonicalGoal: 'REPEAT',
    strategyFocus: '既存顧客が再利用する具体的な理由と時期を伝える',
    topicDirections: ['アフターケア', '再利用理由', '季節提案', '新メニュー', '既存顧客向け情報'],
    ctaDirections: ['再予約する', '次回来店を確認する'],
  },
  BRAND_AWARENESS: {
    goalKind: 'BUSINESS_OUTCOME',
    canonicalGoal: 'AWARENESS',
    strategyFocus: '会社・店舗を知る理由と記憶に残る特徴を伝える',
    topicDirections: ['会社・店舗の特徴', '専門性', 'スタッフ', '考え方', 'ブランドストーリー'],
    ctaDirections: ['フォローする', '保存する', '詳細を見る'],
  },
  TRUST_EXPERTISE: {
    goalKind: 'BUSINESS_OUTCOME',
    canonicalGoal: 'TRUST_EXPERTISE',
    strategyFocus: '実績・専門知識・仕事のプロセスを根拠付きで伝える',
    topicDirections: ['実績', '専門知識', '仕事のプロセス', 'よくある誤解', '顧客の疑問'],
    ctaDirections: ['保存する', '詳細を見る', '相談する'],
  },
  BLOG_TRAFFIC: {
    goalKind: 'DESTINATION',
    canonicalGoal: null,
    strategyFocus: '投稿内で読者価値を示した上で、関連する記事へ自然に案内する',
    topicDirections: ['記事で解決できる疑問', '記事の要点', '詳しい手順'],
    ctaDirections: ['関連記事を読む', '詳しい手順を見る'],
  },
  OTHER: {
    goalKind: 'CUSTOM',
    canonicalGoal: 'OTHER',
    strategyFocus: '承認済み戦略に記録された独自目的を優先する',
    topicDirections: ['承認済み戦略の目的に直接つながる具体的な題材'],
    ctaDirections: ['承認済み戦略で定めた行動'],
  },
} as const satisfies Record<SocialAccountStrategyGoal, WeeklySocialGoalPlanningProfile>;

export function weeklySocialGoalPlanningProfile(
  goal: SocialAccountStrategyGoal,
): WeeklySocialGoalPlanningProfile {
  return weeklyPlanningProfiles[goal];
}

export const socialGoalPlanningProfile = weeklySocialGoalPlanningProfile;
