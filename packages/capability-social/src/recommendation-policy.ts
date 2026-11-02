import { ApplicationError } from '@bunshin/shared';
import {
  SOCIAL_ACTIVITY_BARRIER_CATEGORIES,
  type SocialActivityBarrierCategory,
  type SocialActivityBarrierEvidence,
} from './activity-barrier';

export const SOCIAL_RECOMMENDATION_POLICY_CONFIG_KEY = 'socialRecommendationPolicy';
export const SOCIAL_RECOMMENDATION_POLICY_VERSION = 'social-recommendation-policy-v1';
export interface SocialRecommendationSettings {
  enabled: boolean;
  minimumAccepted: number;
  cooldownDays: number;
  categories: SocialActivityBarrierCategory[];
}
export interface SocialRecommendationPolicy {
  version: typeof SOCIAL_RECOMMENDATION_POLICY_VERSION;
  revision: number;
  headquarters: SocialRecommendationSettings | null;
  service: SocialRecommendationSettings | null;
  lastRequest?: { commandId: string; fingerprint: string };
}
export interface SocialRecommendationPolicyScope {
  workspaceId: string;
  serviceId: string;
  actorUserId: string;
}
export interface SocialRecommendationPolicyView {
  version: typeof SOCIAL_RECOMMENDATION_POLICY_VERSION;
  revision: number;
  headquarters: SocialRecommendationSettings | null;
  service: SocialRecommendationSettings | null;
  effective: SocialRecommendationSettings;
  permissions: { headquarters: boolean; service: boolean };
}
export interface SocialRecommendationPolicyCommand extends SocialRecommendationPolicyScope {
  commandId: string;
  expectedRevision: number;
  authority: 'HEADQUARTERS' | 'SERVICE';
  settings: unknown;
  reason: string;
}
export interface SocialRecommendationPolicyRepository {
  read(scope: SocialRecommendationPolicyScope): Promise<SocialRecommendationPolicyView>;
  save(command: SocialRecommendationPolicyCommand): Promise<SocialRecommendationPolicyView>;
}
export const isPolicyRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function invalid(): never {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid SNS recommendation policy');
}
export function defaultSocialRecommendationSettings(): SocialRecommendationSettings {
  return {
    enabled: true,
    minimumAccepted: 2,
    cooldownDays: 30,
    categories: [...SOCIAL_ACTIVITY_BARRIER_CATEGORIES],
  };
}
export function normalizeSocialRecommendationSettings(
  value: unknown,
): SocialRecommendationSettings {
  if (
    !isPolicyRecord(value) ||
    Object.keys(value).sort().join(',') !== 'categories,cooldownDays,enabled,minimumAccepted' ||
    typeof value['enabled'] !== 'boolean' ||
    !Number.isInteger(value['minimumAccepted']) ||
    Number(value['minimumAccepted']) < 2 ||
    Number(value['minimumAccepted']) > 100 ||
    !Number.isInteger(value['cooldownDays']) ||
    Number(value['cooldownDays']) < 30 ||
    Number(value['cooldownDays']) > 365 ||
    !Array.isArray(value['categories']) ||
    value['categories'].length > 11 ||
    new Set(value['categories']).size !== value['categories'].length ||
    value['categories'].some(
      (category) =>
        !SOCIAL_ACTIVITY_BARRIER_CATEGORIES.includes(category as SocialActivityBarrierCategory),
    )
  )
    invalid();
  return {
    enabled: value['enabled'],
    minimumAccepted: Number(value['minimumAccepted']),
    cooldownDays: Number(value['cooldownDays']),
    categories: SOCIAL_ACTIVITY_BARRIER_CATEGORIES.filter((category) =>
      (value['categories'] as unknown[]).includes(category),
    ),
  };
}
export function readSocialRecommendationPolicy(raw: unknown): SocialRecommendationPolicy {
  if (raw === undefined)
    return {
      version: SOCIAL_RECOMMENDATION_POLICY_VERSION,
      revision: 0,
      headquarters: null,
      service: null,
    };
  if (
    !isPolicyRecord(raw) ||
    raw['version'] !== SOCIAL_RECOMMENDATION_POLICY_VERSION ||
    !Number.isInteger(raw['revision']) ||
    Number(raw['revision']) < 1 ||
    Number(raw['revision']) > 2_147_483_646 ||
    !isPolicyRecord(raw['lastRequest']) ||
    typeof raw['lastRequest']['commandId'] !== 'string' ||
    typeof raw['lastRequest']['fingerprint'] !== 'string'
  )
    invalid();
  return {
    version: SOCIAL_RECOMMENDATION_POLICY_VERSION,
    revision: Number(raw['revision']),
    headquarters: normalizeSocialRecommendationSettings(raw['headquarters']),
    service: raw['service'] === null ? null : normalizeSocialRecommendationSettings(raw['service']),
    lastRequest: {
      commandId: raw['lastRequest']['commandId'],
      fingerprint: raw['lastRequest']['fingerprint'],
    },
  };
}
export function effectiveSocialRecommendationSettings(
  policy: SocialRecommendationPolicy,
): SocialRecommendationSettings {
  const hq = policy.headquarters ?? defaultSocialRecommendationSettings(),
    service = policy.service;
  return service
    ? {
        enabled: hq.enabled && service.enabled,
        minimumAccepted: Math.max(hq.minimumAccepted, service.minimumAccepted),
        cooldownDays: Math.max(hq.cooldownDays, service.cooldownDays),
        categories: hq.categories.filter((category) => service.categories.includes(category)),
      }
    : structuredClone(hq);
}
export function assertServiceRecommendationSettings(
  settings: SocialRecommendationSettings,
  headquarters: SocialRecommendationSettings | null,
) {
  if (
    !headquarters ||
    (settings.enabled && !headquarters.enabled) ||
    settings.minimumAccepted < headquarters.minimumAccepted ||
    settings.cooldownDays < headquarters.cooldownDays ||
    settings.categories.some((category) => !headquarters.categories.includes(category))
  )
    throw new ApplicationError('FORBIDDEN', '本部の条件より緩い設定には変更できません。');
}
export function recommendationEvidenceAllowed(
  settings: SocialRecommendationSettings,
  category: SocialActivityBarrierCategory,
  evidence: SocialActivityBarrierEvidence,
) {
  return (
    settings.enabled &&
    settings.categories.includes(category) &&
    (evidence.evidenceCode !== 'ACCEPTED_WITHOUT_POST_REPORT' ||
      (typeof evidence.metrics.missionAccepted === 'number' &&
        evidence.metrics.missionAccepted >= settings.minimumAccepted))
  );
}
export function socialSupportCooldownDays(snapshot: unknown): number {
  const value = isPolicyRecord(snapshot) ? snapshot['recommendationPolicy'] : undefined;
  if (value === undefined) return 30;
  if (
    !isPolicyRecord(value) ||
    value['version'] !== SOCIAL_RECOMMENDATION_POLICY_VERSION ||
    !Number.isInteger(value['cooldownDays']) ||
    Number(value['cooldownDays']) < 30 ||
    Number(value['cooldownDays']) > 365
  )
    invalid();
  return Number(value['cooldownDays']);
}
