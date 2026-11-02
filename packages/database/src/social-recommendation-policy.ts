import { lockFeaturePolicyGroup } from './group-feature-entitlement';
import {
  SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
  SOCIAL_RECOMMENDATION_POLICY_CONFIG_KEY,
  assertServiceRecommendationSettings,
  effectiveSocialRecommendationSettings,
  normalizeSocialRecommendationSettings,
  readSocialRecommendationPolicy,
  type SocialRecommendationPolicy,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { prisma, type Prisma, type PrismaClient } from './client';
import {
  PrismaManagedFeaturePolicyRepository,
  readManagedFeaturePolicyValue,
} from './managed-feature-policy';

export async function lockRecommendationService(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; serviceId: string },
) {
  await lockFeaturePolicyGroup(tx, { workspaceId: scope.workspaceId, groupId: scope.serviceId });
}
export async function readRecommendationPolicy(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; serviceId: string },
) {
  return readSocialRecommendationPolicy(
    await readManagedFeaturePolicyValue(tx, scope, {
      featureKey: SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
      configKey: SOCIAL_RECOMMENDATION_POLICY_CONFIG_KEY,
    }),
  );
}
export async function readRuntimeRecommendationPolicy(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; serviceId: string },
) {
  try {
    const policy = await readRecommendationPolicy(tx, scope);
    return {
      policy: policy as SocialRecommendationPolicy | null,
      settings: effectiveSocialRecommendationSettings(policy),
    };
  } catch (error) {
    if (!(error instanceof ApplicationError) || error.code !== 'VALIDATION_ERROR') throw error;
    console.error('SNS支援提案の保存設定が不正なため、新規提案を停止しました。');
    return {
      policy: null,
      settings: { enabled: false, minimumAccepted: 100, cooldownDays: 365, categories: [] },
    };
  }
}
export class PrismaSocialRecommendationPolicyRepository extends PrismaManagedFeaturePolicyRepository<
  ReturnType<typeof normalizeSocialRecommendationSettings>,
  SocialRecommendationPolicy
> {
  constructor(client: PrismaClient = prisma) {
    super(
      {
        featureKey: SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
        configKey: SOCIAL_RECOMMENDATION_POLICY_CONFIG_KEY,
        auditKey: 'recommendationPolicy',
        read: readSocialRecommendationPolicy,
        normalize: normalizeSocialRecommendationSettings,
        effective: effectiveSocialRecommendationSettings,
        assertService: assertServiceRecommendationSettings,
      },
      client,
    );
  }
}
