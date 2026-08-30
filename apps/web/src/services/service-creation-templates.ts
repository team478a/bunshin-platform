export const SERVICE_CREATION_TEMPLATE_KEYS = [
  'SIDE_HUSTLE_AFFILIATE',
  'ENTERPRISE_PROGRAM',
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
  },
  ENTERPRISE_PROGRAM: {
    label: '企業・代理店向け',
    description: '招待された参加者だけが利用する、企業運用向けの初期設定です。',
    registrationMode: 'INVITATION_ONLY',
    emailEnabled: true,
    lineEnabled: true,
    inviteCodeEnabled: true,
    referralEnabled: false,
  },
  CUSTOM: {
    label: '自由に設定する',
    description: '用途を決めず、必要な登録方法を個別に設定します。',
    registrationMode: 'INVITATION_ONLY',
    emailEnabled: true,
    lineEnabled: false,
    inviteCodeEnabled: false,
    referralEnabled: false,
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
  }
>;
