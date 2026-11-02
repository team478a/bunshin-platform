import { ApplicationError } from '@bunshin/shared';
import type {
  InferSocialActivityBarriersInput,
  SocialActivityBarrierCandidate,
  SocialActivityBarrierEvidence,
} from './activity-barrier';
import type { SocialActivitySupport } from './activity-barrier-support';
import { isPolicyRecord } from './recommendation-policy';
export const SOCIAL_USAGE_GUIDANCE_CODES = [
  'USAGE_IMAGE_CREDITS',
  'USAGE_MULTIPLE_PLATFORMS',
  'USAGE_REFERRAL_REVIEW',
] as const;
export const SOCIAL_USAGE_GUIDANCE_KEYS = [
  'IMAGE_CREDIT_REVIEW',
  'MULTI_PLATFORM_PREPARATION',
  'REFERRAL_BENEFIT_REVIEW',
] as const;
export const SOCIAL_USAGE_GUIDANCE_CONFIG_KEY = 'socialUsageGuidancePolicy';
export const SOCIAL_USAGE_GUIDANCE_VERSION = 'social-usage-guidance-policy-v1';
export interface SocialUsageGuidanceSettings {
  enabled: boolean;
  imageMinimum: number;
  platformMinimum: number;
  referralMinimum: number;
  questionIntervalDays: number;
}
export interface SocialUsageGuidancePolicy {
  version: typeof SOCIAL_USAGE_GUIDANCE_VERSION;
  revision: number;
  headquarters: SocialUsageGuidanceSettings | null;
  service: SocialUsageGuidanceSettings | null;
  lastRequest?: { commandId: string; fingerprint: string };
}
export interface SocialUsageGuidanceView extends Omit<SocialUsageGuidancePolicy, 'lastRequest'> {
  effective: SocialUsageGuidanceSettings;
  permissions: { headquarters: boolean; service: boolean };
}
export function defaultSocialUsageGuidanceSettings(): SocialUsageGuidanceSettings {
  return {
    enabled: true,
    imageMinimum: 5,
    platformMinimum: 2,
    referralMinimum: 3,
    questionIntervalDays: 7,
  };
}
function invalid(): never {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid SNS usage guidance policy');
}
export function normalizeSocialUsageGuidanceSettings(value: unknown): SocialUsageGuidanceSettings {
  if (
    !isPolicyRecord(value) ||
    Object.keys(value).sort().join(',') !==
      'enabled,imageMinimum,platformMinimum,questionIntervalDays,referralMinimum' ||
    typeof value['enabled'] !== 'boolean'
  )
    invalid();
  const ranges = {
    imageMinimum: [5, 1000],
    platformMinimum: [2, 10],
    referralMinimum: [3, 1000],
    questionIntervalDays: [2, 90],
  } as const;
  for (const [key, range] of Object.entries(ranges))
    if (
      !Number.isInteger(value[key]) ||
      Number(value[key]) < range[0] ||
      Number(value[key]) > range[1]
    )
      invalid();
  return {
    enabled: value['enabled'],
    imageMinimum: Number(value['imageMinimum']),
    platformMinimum: Number(value['platformMinimum']),
    referralMinimum: Number(value['referralMinimum']),
    questionIntervalDays: Number(value['questionIntervalDays']),
  };
}
export function readSocialUsageGuidancePolicy(raw: unknown): SocialUsageGuidancePolicy {
  if (raw === undefined)
    return {
      version: SOCIAL_USAGE_GUIDANCE_VERSION,
      revision: 0,
      headquarters: null,
      service: null,
    };
  if (
    !isPolicyRecord(raw) ||
    raw['version'] !== SOCIAL_USAGE_GUIDANCE_VERSION ||
    !Number.isInteger(raw['revision']) ||
    Number(raw['revision']) < 1 ||
    Number(raw['revision']) > 2_147_483_646 ||
    !isPolicyRecord(raw['lastRequest']) ||
    typeof raw['lastRequest']['commandId'] !== 'string' ||
    typeof raw['lastRequest']['fingerprint'] !== 'string'
  )
    invalid();
  return {
    version: SOCIAL_USAGE_GUIDANCE_VERSION,
    revision: Number(raw['revision']),
    headquarters: normalizeSocialUsageGuidanceSettings(raw['headquarters']),
    service: raw['service'] === null ? null : normalizeSocialUsageGuidanceSettings(raw['service']),
    lastRequest: {
      commandId: raw['lastRequest']['commandId'],
      fingerprint: raw['lastRequest']['fingerprint'],
    },
  };
}
export function effectiveSocialUsageGuidanceSettings(
  policy: SocialUsageGuidancePolicy,
): SocialUsageGuidanceSettings {
  const hq = policy.headquarters ?? defaultSocialUsageGuidanceSettings(),
    local = policy.service;
  return local
    ? {
        enabled: hq.enabled && local.enabled,
        imageMinimum: Math.max(hq.imageMinimum, local.imageMinimum),
        platformMinimum: Math.max(hq.platformMinimum, local.platformMinimum),
        referralMinimum: Math.max(hq.referralMinimum, local.referralMinimum),
        questionIntervalDays: Math.max(hq.questionIntervalDays, local.questionIntervalDays),
      }
    : { ...hq };
}
export function assertServiceUsageGuidanceSettings(
  settings: SocialUsageGuidanceSettings,
  hq: SocialUsageGuidanceSettings | null,
) {
  if (
    !hq ||
    (settings.enabled && !hq.enabled) ||
    settings.imageMinimum < hq.imageMinimum ||
    settings.platformMinimum < hq.platformMinimum ||
    settings.referralMinimum < hq.referralMinimum ||
    settings.questionIntervalDays < hq.questionIntervalDays
  )
    throw new ApplicationError('FORBIDDEN', '本部の条件より緩い設定には変更できません。');
}
const definitions = {
  USAGE_IMAGE_CREDITS: {
    category: 'MEDIA',
    metric: 'successfulImageRequests',
    minimum: 'imageMinimum',
    label: '画像の利用枠と残り回数を確認したい',
    support: {
      key: 'IMAGE_CREDIT_REVIEW',
      title: '画像作成の利用枠を確認する',
      reason: '画像作成の記録があるため、次に作る前に利用枠を確認できます。',
      steps: [
        '画像作成回数の画面で残り回数と有効期限を確認する',
        '無料枠・紹介特典の条件を確認する。自動付与は行いません',
        '必要な画像を一つ選んでから、ご自身の操作で作成する',
      ],
    },
  },
  USAGE_MULTIPLE_PLATFORMS: {
    category: 'EFFORT',
    metric: 'usedPlatforms',
    minimum: 'platformMinimum',
    label: '複数SNSの投稿準備を整理したい',
    support: {
      key: 'MULTI_PLATFORM_PREPARATION',
      title: '複数SNSの投稿準備をまとめる',
      reason: '複数のSNSで採用・コピー・投稿報告の記録があります。手動で準備を整理する方法です。',
      steps: [
        '伝える内容を一つに決め、共通の下書きを準備する',
        '各SNSに合わせて長さ・画像・案内先を確認する',
        '公開前に各SNSの下書きを確認する。自動投稿や外部接続は行いません',
      ],
    },
  },
  USAGE_REFERRAL_REVIEW: {
    category: 'EFFECT',
    metric: 'confirmedReferrals',
    minimum: 'referralMinimum',
    label: '紹介状況と特典の条件を確認したい',
    support: {
      key: 'REFERRAL_BENEFIT_REVIEW',
      title: '紹介の状況と特典を確認する',
      reason: '審査・確定済みの紹介記録があります。適用中の条件と付与済みの回数を確認できます。',
      steps: [
        '活動・紹介の画面で自分の有効紹介人数を確認する',
        '画像作成回数の画面で付与済みの回数と有効期限を確認する',
        '人数だけで機能体験や追加特典が確定するわけではありません。不明点は運営へ確認する',
      ],
    },
  },
} as const;
export function isSocialUsageGuidance(code: string): code is keyof typeof definitions {
  return Object.hasOwn(definitions, code);
}
export function socialUsageGuidanceDefinition(code: string) {
  return isSocialUsageGuidance(code) ? definitions[code] : null;
}
export function usageGuidanceAllowed(
  settings: SocialUsageGuidanceSettings,
  evidence: SocialActivityBarrierEvidence,
  category?: string,
) {
  const def = socialUsageGuidanceDefinition(evidence.evidenceCode);
  if (!def) return true;
  if (category !== undefined && category !== def.category) return false;
  const count = evidence.metrics[def.metric];
  return (
    settings.enabled &&
    typeof count === 'number' &&
    Number.isSafeInteger(count) &&
    count >= settings[def.minimum]
  );
}
export function inferSocialUsageGuidance(
  input: InferSocialActivityBarriersInput,
): SocialActivityBarrierCandidate[] {
  const signals = input.usageGuidance;
  if (!signals || !input.metrics.onboardingCompleted) return [];
  for (const count of Object.values(signals))
    if (count !== null && (!Number.isSafeInteger(count) || count < 0)) invalid();
  const settings = defaultSocialUsageGuidanceSettings();
  return SOCIAL_USAGE_GUIDANCE_CODES.flatMap((code, index) => {
    const def = definitions[code],
      count = signals[def.metric];
    if (count === null || count < settings[def.minimum]) return [];
    return [
      {
        scope: { ...input.scope },
        category: def.category,
        status: 'SUSPECTED' as const,
        priority: index + 100,
        evidence: {
          evidenceCode: code,
          observationWindow: {
            from: input.observationWindow.from.toISOString(),
            to: input.observationWindow.to.toISOString(),
            eligibleDays: input.observationWindow.eligibleDays,
            excludedSystemIncidentDays: input.observationWindow.excludedSystemIncidentDays,
          },
          metrics: { [def.metric]: count },
          thresholds: { [def.minimum]: settings[def.minimum] },
          goalAttribution: null,
          goalMetrics: null,
          ruleVersion: 'social-usage-guidance-v1' as const,
        },
      },
    ];
  });
}
export function usageGuidanceSupport(code: string): SocialActivitySupport | null {
  const def = socialUsageGuidanceDefinition(code);
  return def ? { ...def.support, steps: [...def.support.steps] } : null;
}
