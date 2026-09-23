import type {
  AdvertisingReviewInput,
  CampaignContentClassification,
  CampaignPlanningContext,
} from '@bunshin/application';
import {
  AdvertisingSafetyService,
  CampaignSafetyValidationService,
  ExternalLinkPlacementService,
  ExternalTrackingLinkService,
  GroupFeatureEntitlementService,
  applyExternalLinkPlacement,
} from '@bunshin/application';
import type {
  MissionContent,
  SocialPlatform,
  SocialPreferredFormat,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { campaignContentSignature } from './campaign-content-signature';
import {
  inspectDailyMissionContent,
  type RecentDailyMissionContent,
} from './daily-mission-content-quality';
import {
  applyServiceContentTerminology,
  type ServiceContentTerminologyPolicy,
} from './service-content-terminology';

interface GenerationScope {
  workspaceId: string;
  groupId?: string | null;
  bunshinId: string;
  actorUserId: string;
}

export interface ExternalLinkUsage {
  groupId: string;
  productPackId: string;
  productPackVersionId: string;
  campaignId: string;
  externalTrackingLinkId: string;
  insertedUrl: string;
  placementTemplateId: string | null;
  placementTemplateVersion: number | null;
}

export interface CampaignSafetyReceipt {
  campaignId: string;
  missionDate: string;
  signature: ReturnType<typeof campaignContentSignature>;
  similarity: {
    maxSimilarityBasisPoints: number;
    verdict: 'UNIQUE' | 'POSSIBLE_DUPLICATE';
  };
  advertisingInput: AdvertisingReviewInput;
}

export async function finalizeDailyMissionContent(input: {
  scope: GenerationScope;
  missionDate: string;
  generationIdempotencyKey: string;
  campaign: CampaignPlanningContext | null;
  platform: SocialPlatform;
  format: SocialPreferredFormat;
  classification: CampaignContentClassification;
  content: MissionContent;
  terminologyPolicy: ServiceContentTerminologyPolicy | null;
  recentMissions: RecentDailyMissionContent[];
}): Promise<{
  content: MissionContent;
  externalLinkUsage?: ExternalLinkUsage;
  campaignSafetyReceipt: CampaignSafetyReceipt | null;
}> {
  const db = await import('@bunshin/database');
  let content = input.content;
  let externalLinkUsage: ExternalLinkUsage | undefined;

  if (input.campaign) {
    const trackingLink = await new ExternalTrackingLinkService(
      new db.PrismaExternalTrackingLinkRepository(),
    ).resolve({
      ...input.scope,
      groupId: input.campaign.productPack.groupId,
      productPackId: input.campaign.productPack.productPackId,
      campaignId: input.campaign.id,
      at: new Date(`${input.missionDate}T12:00:00.000Z`),
    });
    if (!trackingLink && !input.campaign.productPack.allowLinklessPosts)
      throw new ApplicationError(
        'CONFLICT',
        'この商品に使用できる専用URLが設定されていません。管理者へお問い合わせください。',
      );
    if (trackingLink) {
      const linkAccess = await new GroupFeatureEntitlementService(
        new db.PrismaGroupFeatureEntitlementRepository(),
      ).consumeAccess({
        workspaceId: input.scope.workspaceId,
        groupId: input.campaign.productPack.groupId,
        actorUserId: input.scope.actorUserId,
        featureKey: 'GROUP.EXTERNAL_TRACKING_LINK',
        operationKey: `${input.generationIdempotencyKey}:GROUP.EXTERNAL_TRACKING_LINK`,
        localDate: input.missionDate,
      });
      if (!linkAccess.allowed)
        throw new ApplicationError('FORBIDDEN', 'group tracking link is not available', {
          featureKey: 'GROUP.EXTERNAL_TRACKING_LINK',
          reason: linkAccess.reason,
        });
      const placement = await new ExternalLinkPlacementService(
        new db.PrismaExternalLinkPlacementRepository(),
      ).resolveForGeneration({
        ...input.scope,
        productPackVersionId: input.campaign.productPack.versionId,
        platform: input.platform,
        format: input.format,
      });
      content = applyExternalLinkPlacement({
        content,
        url: trackingLink.url,
        platform: input.platform,
        format: input.format,
        placement,
      });
      externalLinkUsage = {
        groupId: input.campaign.productPack.groupId,
        productPackId: input.campaign.productPack.productPackId,
        productPackVersionId: input.campaign.productPack.versionId,
        campaignId: input.campaign.id,
        externalTrackingLinkId: trackingLink.id,
        insertedUrl: trackingLink.url,
        placementTemplateId: placement.id,
        placementTemplateVersion: placement.version,
      };
    }
  }

  content = applyServiceContentTerminology(content, input.terminologyPolicy);
  let campaignSafetyReceipt: CampaignSafetyReceipt | null = null;
  if (input.campaign) {
    const signature = campaignContentSignature(content);
    const campaignSafety = new CampaignSafetyValidationService(
      new db.PrismaCampaignSafetyRepository(),
    );
    const similarity = await campaignSafety.inspect({
      ...input.scope,
      campaignId: input.campaign.id,
      ...signature,
      at: new Date(`${input.missionDate}T12:00:00.000Z`),
    });
    if (similarity.verdict === 'POSSIBLE_DUPLICATE') {
      await campaignSafety.record({
        ...input.scope,
        campaignId: input.campaign.id,
        dailyMissionId: null,
        at: new Date(`${input.missionDate}T12:00:00.000Z`),
        ...signature,
        ...similarity,
      });
      throw new ApplicationError('CONTENT_REJECTED', 'campaign content is too similar');
    }
    const advertisingInput: AdvertisingReviewInput = {
      ...input.scope,
      productPackVersionId: input.campaign.productPack.versionId,
      classification: input.classification,
      evidenceRequirement: 'NONE',
      evidenceIds: [],
      officialClaims: input.campaign.productPack.facts,
      content: JSON.stringify(content),
    };
    const safety = await new AdvertisingSafetyService(
      new db.PrismaAdvertisingSafetyRepository(),
    ).inspect(advertisingInput);
    if (safety.inspected.verdict !== 'PASS')
      throw new ApplicationError('CONTENT_REJECTED', 'campaign content failed safety gate', {
        issueCodes: safety.inspected.issueCodes,
      });
    campaignSafetyReceipt = {
      campaignId: input.campaign.id,
      missionDate: input.missionDate,
      signature,
      similarity,
      advertisingInput,
    };
  }

  const finalNoveltyIssue = inspectDailyMissionContent({
    content,
    recentMissions: input.recentMissions,
  });
  if (finalNoveltyIssue)
    throw new ApplicationError(
      'CONTENT_REJECTED',
      'generated mission is too similar to recent content',
      finalNoveltyIssue,
    );

  return {
    content,
    ...(externalLinkUsage ? { externalLinkUsage } : {}),
    campaignSafetyReceipt,
  };
}

export async function recordDailyMissionCampaignSafety(input: {
  scope: GenerationScope;
  dailyMissionId: string;
  receipt: CampaignSafetyReceipt | null;
}) {
  if (!input.receipt) return;
  const db = await import('@bunshin/database');
  await new AdvertisingSafetyService(new db.PrismaAdvertisingSafetyRepository()).review({
    ...input.receipt.advertisingInput,
    dailyMissionId: input.dailyMissionId,
  });
  await new CampaignSafetyValidationService(new db.PrismaCampaignSafetyRepository()).record({
    ...input.scope,
    campaignId: input.receipt.campaignId,
    dailyMissionId: input.dailyMissionId,
    at: new Date(`${input.receipt.missionDate}T12:00:00.000Z`),
    ...input.receipt.signature,
    ...input.receipt.similarity,
  });
}
