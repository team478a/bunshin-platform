export const SERVICE_CREATION_TEMPLATE_KEYS = [
  'SIDE_HUSTLE_AFFILIATE',
  'ENTERPRISE_PROGRAM',
  'BUSINESS_DAILY_IDEAS',
  'FORTUNE_DAILY_GUIDANCE',
  'CUSTOM',
] as const;

export type ServiceCreationTemplateKey = (typeof SERVICE_CREATION_TEMPLATE_KEYS)[number];

export const FORTUNE_INITIAL_MEMBER_LIMIT = 100;
export const FORTUNE_PACKAGE_KEY = 'FORTUNE_DAILY_GUIDANCE' as const;
export const CURRENT_FORTUNE_PACKAGE_VERSION = 2;

export type FortunePackageReleaseState =
  'CURRENT' | 'UPDATE_AVAILABLE' | 'UNSUPPORTED_NEWER' | 'NOT_SELECTED';

export interface FortunePackageReleaseStatus {
  key: typeof FORTUNE_PACKAGE_KEY | null;
  installedVersion: number | null;
  currentVersion: number;
  state: FortunePackageReleaseState;
}

export const SERVICE_CREATION_TEMPLATES = {
  SIDE_HUSTLE_AFFILIATE: {
    label: '副業・アフィリエイト向け',
    description: '公開登録と紹介元記録を使い、個人が参加しやすい初期設定です。',
    registrationMode: 'PUBLIC',
    emailEnabled: true,
    lineEnabled: true,
    inviteCodeEnabled: false,
    referralEnabled: true,
    onboarding: {
      welcomeTitle: 'あなたに合った投稿を考えるために、少し教えてください',
      welcomeMessage: 'むずかしく考えなくて大丈夫です。今のあなたに近い答えを書いてください。',
      questions: [
        'どのSNSで発信したいですか？',
        'どんな人に投稿を見てほしいですか？',
        'どんな商品や活動を紹介したいですか？',
        '投稿を続けて、どうなりたいですか？',
        '投稿づくりに1日何分くらい使えますか？',
      ],
    },
  },
  ENTERPRISE_PROGRAM: {
    label: '企業・代理店向け',
    description: '招待された参加者だけが利用する、企業運用向けの初期設定です。',
    registrationMode: 'INVITATION_ONLY',
    emailEnabled: true,
    lineEnabled: true,
    inviteCodeEnabled: true,
    referralEnabled: false,
    onboarding: {
      welcomeTitle: 'あなたの活動に合った投稿を考えるために、少し教えてください',
      welcomeMessage: '会社や活動のことを、わかる範囲で答えてください。あとから変更できます。',
      questions: [
        'どのSNSで発信したいですか？',
        'あなたは会社や活動の中で、どんな役割ですか？',
        'どんな人に投稿を見てほしいですか？',
        'どの商品や活動を知ってほしいですか？',
        '投稿を見た人に、次に何をしてほしいですか？',
        '投稿づくりに1日何分くらい使えますか？',
      ],
    },
  },
  BUSINESS_DAILY_IDEAS: {
    label: '企業向け毎日投稿サポート',
    description: '業種と目的に合う完成投稿文を、毎日LINEで受け取る無料サービス向けです。',
    registrationMode: 'PUBLIC',
    emailEnabled: false,
    lineEnabled: true,
    inviteCodeEnabled: false,
    referralEnabled: false,
    businessProfileEnabled: true,
    dailyIdeaDelivery: {
      enabled: true,
      cadence: 'DAILY',
      defaultNotificationTime: '08:00',
      lockCadence: true,
      contentMode: 'READY_TO_USE',
      mediaMode: 'TEXT_ONLY',
    },
    onboarding: {
      welcomeTitle: 'あなたの事業に合う投稿文をお届けします',
      welcomeMessage:
        '業種や商品について教えてください。設定後は毎日LINEに、コピーして使える投稿文が届きます。',
      questions: ['発信するときに大切にしたいことを教えてください。'],
    },
  },
  FORTUNE_DAILY_GUIDANCE: {
    label: '占いサービス向け',
    description: '1日1回の占いと希望者への週次LINE通知を、安全確認後に公開する初期設定です。',
    registrationMode: 'PUBLIC',
    emailEnabled: false,
    lineEnabled: true,
    inviteCodeEnabled: false,
    referralEnabled: false,
    fortunePackage: {
      key: FORTUNE_PACKAGE_KEY,
      version: CURRENT_FORTUNE_PACKAGE_VERSION,
      memberLimit: FORTUNE_INITIAL_MEMBER_LIMIT,
      minimumAge: 18,
      historyRetentionDays: 90,
      weeklyNotificationEnabled: false,
      aiEnabled: false,
    },
    onboarding: {
      welcomeTitle: '今日を考えるヒントを受け取る準備をします',
      welcomeMessage:
        '登録後に年齢を確認すると、恋愛・仕事・人間関係から1つ選んで、1日1回カードを引けます。',
      questions: [],
    },
  },
  CUSTOM: {
    label: '自由に設定する',
    description: '用途を決めず、必要な登録方法を個別に設定します。',
    registrationMode: 'INVITATION_ONLY',
    emailEnabled: true,
    lineEnabled: false,
    inviteCodeEnabled: false,
    referralEnabled: false,
    businessProfileEnabled: false,
    dailyIdeaDelivery: {
      enabled: false,
      cadence: 'DAILY',
      defaultNotificationTime: '08:00',
      lockCadence: false,
      contentMode: 'READY_TO_USE',
      mediaMode: 'TEXT_ONLY',
    },
    onboarding: {
      welcomeTitle: '',
      welcomeMessage: '',
      questions: [],
    },
  },
} as const satisfies Record<
  ServiceCreationTemplateKey,
  {
    label: string;
    description: string;
    registrationMode: 'PUBLIC' | 'INVITATION_ONLY';
    emailEnabled: boolean;
    lineEnabled: boolean;
    inviteCodeEnabled: boolean;
    referralEnabled: boolean;
    businessProfileEnabled?: boolean;
    dailyIdeaDelivery?: {
      enabled: boolean;
      cadence: 'DAILY' | 'WEEKDAYS';
      defaultNotificationTime: string;
      lockCadence: boolean;
      contentMode: 'IDEA' | 'PROMPT' | 'READY_TO_USE';
      mediaMode: 'TEXT_ONLY' | 'IMAGE' | 'VIDEO' | 'IMAGE_AND_VIDEO';
    };
    fortunePackage?: {
      key: typeof FORTUNE_PACKAGE_KEY;
      version: typeof CURRENT_FORTUNE_PACKAGE_VERSION;
      memberLimit: typeof FORTUNE_INITIAL_MEMBER_LIMIT;
      minimumAge: 18;
      historyRetentionDays: 90;
      weeklyNotificationEnabled: false;
      aiEnabled: false;
    };
    onboarding: {
      welcomeTitle: string;
      welcomeMessage: string;
      questions: readonly string[];
    };
  }
>;

export function fortunePackageReleaseStatus(value: unknown): FortunePackageReleaseStatus {
  const unavailable: FortunePackageReleaseStatus = {
    key: null,
    installedVersion: null,
    currentVersion: CURRENT_FORTUNE_PACKAGE_VERSION,
    state: 'NOT_SELECTED',
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable;
  const fortunePackage = (value as Record<string, unknown>)['fortunePackage'];
  if (
    typeof fortunePackage !== 'object' ||
    fortunePackage === null ||
    Array.isArray(fortunePackage)
  )
    return unavailable;
  const packageRecord = fortunePackage as Record<string, unknown>;
  const version = packageRecord['version'];
  if (
    packageRecord['key'] !== FORTUNE_PACKAGE_KEY ||
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1
  )
    return unavailable;
  return {
    key: FORTUNE_PACKAGE_KEY,
    installedVersion: version,
    currentVersion: CURRENT_FORTUNE_PACKAGE_VERSION,
    state:
      version === CURRENT_FORTUNE_PACKAGE_VERSION
        ? 'CURRENT'
        : version < CURRENT_FORTUNE_PACKAGE_VERSION
          ? 'UPDATE_AVAILABLE'
          : 'UNSUPPORTED_NEWER',
  };
}

export function isFortuneServicePackage(value: unknown): boolean {
  return fortunePackageReleaseStatus(value).state !== 'NOT_SELECTED';
}
