export const SERVICE_CREATION_TEMPLATE_KEYS = [
  'SIDE_HUSTLE_AFFILIATE',
  'ENTERPRISE_PROGRAM',
  'BUSINESS_DAILY_IDEAS',
  'CUSTOM',
] as const;

export type ServiceCreationTemplateKey = (typeof SERVICE_CREATION_TEMPLATE_KEYS)[number];

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
    onboarding: {
      welcomeTitle: string;
      welcomeMessage: string;
      questions: readonly string[];
    };
  }
>;
