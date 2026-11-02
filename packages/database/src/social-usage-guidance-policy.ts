import { ApplicationError } from '@bunshin/shared';
import {
  SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
  SOCIAL_USAGE_GUIDANCE_CONFIG_KEY,
  readSocialUsageGuidancePolicy,
  normalizeSocialUsageGuidanceSettings,
  effectiveSocialUsageGuidanceSettings,
  assertServiceUsageGuidanceSettings,
  type SocialUsageGuidanceSettings,
  type SocialUsageGuidancePolicy,
} from '@bunshin/capability-social';
import { prisma, type Prisma, type PrismaClient } from './client';
import {
  PrismaManagedFeaturePolicyRepository,
  readManagedFeaturePolicyValue,
} from './managed-feature-policy';
const descriptor = {
  featureKey: SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
  configKey: SOCIAL_USAGE_GUIDANCE_CONFIG_KEY,
};
export class PrismaSocialUsageGuidancePolicyRepository extends PrismaManagedFeaturePolicyRepository<
  SocialUsageGuidanceSettings,
  SocialUsageGuidancePolicy
> {
  constructor(client: PrismaClient = prisma) {
    super(
      {
        ...descriptor,
        read: readSocialUsageGuidancePolicy,
        normalize: normalizeSocialUsageGuidanceSettings,
        effective: effectiveSocialUsageGuidanceSettings,
        assertService: assertServiceUsageGuidanceSettings,
      },
      client,
    );
  }
}
export async function readRuntimeUsageGuidancePolicy(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; serviceId: string },
) {
  try {
    const policy = readSocialUsageGuidancePolicy(
      await readManagedFeaturePolicyValue(tx, scope, descriptor),
    );
    return { valid: true, policy, settings: effectiveSocialUsageGuidanceSettings(policy) };
  } catch (error) {
    if (!(error instanceof ApplicationError) || error.code !== 'VALIDATION_ERROR') throw error;
    console.error('SNS利用案内の保存設定が不正なため、新規の質問を停止しました。');
    return {
      valid: false,
      policy: null,
      settings: {
        enabled: false,
        imageMinimum: 1000,
        platformMinimum: 10,
        referralMinimum: 1000,
        questionIntervalDays: 90,
      },
    };
  }
}
