export interface ServiceOnboardingSettings {
  welcomeTitle: string;
  welcomeMessage: string;
  questions: string[];
  profileQuestions: ServiceProfileQuestionSettings;
}

export interface ServiceOnboardingChoicePreset {
  options: readonly string[];
  otherLabel: string;
}

const SNS_OPTIONS = [
  'インスタグラム',
  'X（旧Twitter）',
  'スレッズ',
  'TikTok',
  'YouTubeショート',
  'まだ決めていない',
] as const;

const AUDIENCE_OPTIONS = [
  '友人・知人',
  '家族・親戚',
  '同世代の方',
  '地域の方',
  '仕事関係の方',
  '同じ趣味・関心を持つ方',
] as const;

const PRODUCT_OPTIONS = [
  '自分が使ってよかった商品',
  '興味のある商品・サービス',
  'イベント・体験',
  '地域やコミュニティの活動',
  '自分や所属先の活動',
  'まだ決めていない',
] as const;

function normalizedQuestion(question: string) {
  return question.replace(/\s+/g, '').replaceAll('？', '?');
}

/** Known questions use tap-friendly answers; custom questions stay free text. */
export function serviceOnboardingChoicePreset(
  question: string,
): ServiceOnboardingChoicePreset | null {
  const value = normalizedQuestion(question);
  if (value.includes('どのSNSで発信') || value.includes('どのSNSに投稿')) {
    return { options: SNS_OPTIONS, otherLabel: 'ほかのSNSを入力する' };
  }
  if (value.includes('どんな人に投稿を見てほしい') || value.includes('どのような方とつながって')) {
    return { options: AUDIENCE_OPTIONS, otherLabel: 'ほかの相手を入力する' };
  }
  if (value.includes('どんな商品や活動を紹介') || value.includes('どの商品や活動を知ってほしい')) {
    return { options: PRODUCT_OPTIONS, otherLabel: 'ほかの商品・活動を入力する' };
  }
  if (value.includes('投稿を続けて、どうなりたい')) {
    return {
      options: [
        '無理なく投稿を続けたい',
        '投稿に慣れたい',
        '活動を多くの人に知ってほしい',
        '収入につなげたい',
        '同じ関心を持つ仲間を増やしたい',
        'まだ決めていない',
      ],
      otherLabel: 'ほかの目標を入力する',
    };
  }
  if (value.includes('投稿づくりに1日何分')) {
    return {
      options: ['5分くらい', '10分くらい', '15分くらい', '30分くらい', '日によって違う'],
      otherLabel: 'ほかの時間を入力する',
    };
  }
  if (value.includes('どのようなきっかけで知りましたか')) {
    return {
      options: [
        '友人・知人からの紹介',
        '説明会・イベント',
        'SNS・インターネット',
        'LINEで知った',
        'すでに活動している',
        'よく覚えていない',
      ],
      otherLabel: 'ほかのきっかけを入力する',
    };
  }
  if (value.includes('実際に感じたことや伝えたいこと')) {
    return {
      options: [
        'これからの可能性を感じる',
        '人とのつながりが魅力だと思う',
        '新しい体験や学びがある',
        '多くの人に知ってほしい',
        'もう少し知ってから考えたい',
        'まだありません',
      ],
      otherLabel: '自分の言葉で入力する',
    };
  }
  if (value.includes('どんな役割ですか')) {
    return {
      options: ['販売・案内', '広報・SNS', '運営・管理', '現場・サービス提供', '参加メンバー'],
      otherLabel: 'ほかの役割を入力する',
    };
  }
  if (value.includes('次に何をしてほしい')) {
    return {
      options: [
        '商品・サービスを知ってほしい',
        '案内URLを見てほしい',
        '問い合わせてほしい',
        'イベントに参加してほしい',
        'まだ決めていない',
      ],
      otherLabel: 'ほかの行動を入力する',
    };
  }
  return null;
}

export interface ServiceProfileQuestionSettings {
  industry: boolean;
  purpose: boolean;
  activityName: boolean;
  businessName: boolean;
  region: boolean;
  productService: boolean;
  socialProfile: boolean;
  notificationConsent: boolean;
}

export const DEFAULT_SERVICE_PROFILE_QUESTIONS: ServiceProfileQuestionSettings = {
  industry: true,
  purpose: true,
  activityName: true,
  businessName: true,
  region: true,
  productService: true,
  socialProfile: true,
  notificationConsent: true,
};

export interface ServiceAnnouncement {
  enabled: boolean;
  title: string;
  message: string;
  startsAt: string | null;
  endsAt: string | null;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function readServiceOnboardingSettings(
  onboardingConfig: unknown,
  surveyConfig: unknown,
): ServiceOnboardingSettings {
  const onboarding = record(onboardingConfig);
  const survey = record(surveyConfig);
  const configuredProfileQuestions = record(onboarding.profileQuestions);
  const profileQuestions = Object.fromEntries(
    Object.entries(DEFAULT_SERVICE_PROFILE_QUESTIONS).map(([key, fallback]) => [
      key,
      typeof configuredProfileQuestions[key] === 'boolean'
        ? configuredProfileQuestions[key]
        : fallback,
    ]),
  ) as unknown as ServiceProfileQuestionSettings;
  return {
    welcomeTitle: typeof onboarding.welcomeTitle === 'string' ? onboarding.welcomeTitle : '',
    welcomeMessage: typeof onboarding.welcomeMessage === 'string' ? onboarding.welcomeMessage : '',
    questions: Array.isArray(survey.questions)
      ? survey.questions.filter((item): item is string => typeof item === 'string').slice(0, 7)
      : [],
    profileQuestions,
  };
}

/**
 * Returns the service-wide notice shown on the signed-in participant home.
 * This intentionally lives with the service onboarding configuration: it is
 * lightweight operational copy, not a message delivery or a personal record.
 */
export function readServiceAnnouncement(onboardingConfig: unknown): ServiceAnnouncement {
  const onboarding = record(onboardingConfig);
  const date = (value: unknown) => {
    if (typeof value !== 'string') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };
  return {
    enabled: onboarding.announcementEnabled === true,
    title:
      typeof onboarding.announcementTitle === 'string' ? onboarding.announcementTitle.trim() : '',
    message:
      typeof onboarding.announcementMessage === 'string'
        ? onboarding.announcementMessage.trim()
        : '',
    startsAt: date(onboarding.announcementStartsAt),
    endsAt: date(onboarding.announcementEndsAt),
  };
}

export function isServiceAnnouncementVisible(announcement: ServiceAnnouncement, now = new Date()) {
  if (!announcement.enabled || !announcement.title || !announcement.message) return false;
  if (announcement.startsAt && new Date(announcement.startsAt) > now) return false;
  return !announcement.endsAt || new Date(announcement.endsAt) > now;
}
