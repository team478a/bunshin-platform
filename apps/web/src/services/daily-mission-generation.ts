import 'server-only';
import {
  CheckMissionQuality,
  CreateDailyMission,
  GenerateDailyMissionBrief,
  GenerateMissionContent,
  ListContentPillars,
  ListDailyMissions,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListActiveTrendIdeas,
  ListWeeklyPlans,
} from '@bunshin/capability-social';
import {
  GetBunshin,
  ListGrantedKnowledgeForBunshin,
  ListPersonalityVersions,
  RequireActiveBunshinCapability,
  SelectBunshinMemories,
  ProductPackService,
  CampaignService,
  AdvertisingSafetyService,
  CampaignSafetyValidationService,
  ExternalTrackingLinkService,
  ExternalLinkPlacementService,
  GroupFeatureEntitlementService,
  GroupKnowledgeService,
  selectGroupKnowledgeChunksForPrompt,
  applyExternalLinkPlacement,
} from '@bunshin/application';
import { createLogger } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import { OpenAIDailyMissionPlanner } from '../providers/openai-daily-mission-planner';
import { OpenAIMissionContentGenerator } from '../providers/openai-mission-content-generator';
import { OpenAIMissionQualityChecker } from '../providers/openai-mission-quality-checker';
import { campaignContentSignature } from './campaign-content-signature';
import { loadServiceGenerationKnowledge } from './service-generation-knowledge';

interface Input {
  workspaceId: string;
  groupId?: string | null;
  bunshinId: string;
  actorUserId: string;
  missionDate: string;
  timezone?: string;
  socialProfileId?: string;
  generationIdempotencyKey: string;
  usageIdempotencyPrefix: string;
  existingPolicy: 'RETURN' | 'CONFLICT';
  serviceSafeMode?: boolean;
}

const errorCategory = (error: unknown) => {
  if (error instanceof ApplicationError) {
    const cause = error.cause;
    if (cause && typeof cause === 'object' && 'category' in cause) {
      const category = (cause as { category?: unknown }).category;
      if (typeof category === 'string') return category;
    }
    return error.code;
  }
  return 'INTERNAL_ERROR';
};

const daysBefore = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
};

export class DailyMissionGenerationService {
  async execute(input: Input) {
    const started = Date.now();
    let runtimeModel = process.env['OPENAI_MODEL'] ?? 'gpt-5.2';
    const logger = createLogger().child({
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      operation: 'daily-mission-generation',
    });
    const scope = {
      workspaceId: input.workspaceId,
      ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
      bunshinId: input.bunshinId,
      actorUserId: input.actorUserId,
    };
    const db = await import('@bunshin/database');
    const assignments = new db.PrismaBunshinCapabilityAssignmentRepository();
    const missions = new db.PrismaDailyMissionRepository();
    let generationId: string | null = null;
    try {
      await new RequireActiveBunshinCapability(assignments).execute({
        ...scope,
        capabilityType: 'SOCIAL',
      });
      const existing = (
        await new ListDailyMissions(missions).execute({
          ...scope,
          from: input.missionDate,
          to: input.missionDate,
        })
      ).find(({ missionDate }) => missionDate === input.missionDate);
      if (existing) {
        if (input.existingPolicy === 'RETURN') return existing;
        throw new ApplicationError('CONFLICT', 'daily mission already exists');
      }
      const recentFormats = (
        await new ListDailyMissions(missions).execute({
          ...scope,
          from: daysBefore(input.missionDate, 7),
          to: daysBefore(input.missionDate, 1),
        })
      ).map(({ format }) => format);
      const productPack = input.serviceSafeMode
        ? null
        : await new ProductPackService(new db.PrismaProductPackRepository()).resolveForGeneration(
            scope,
          );
      const profiles = await new ListSocialProfiles(new db.PrismaSocialProfileRepository()).execute(
        scope,
      );
      const profile = input.socialProfileId
        ? profiles.find(({ id, status }) => id === input.socialProfileId && status === 'ACTIVE')
        : profiles.find(({ status }) => status === 'ACTIVE');
      if (!profile) throw new ApplicationError('NOT_FOUND', 'active social profile not found');
      const strategies = await new ListSocialAccountStrategies(
        new db.PrismaSocialAccountStrategyRepository(),
      ).execute({ ...scope, socialProfileId: profile.id });
      const strategy = strategies.find(({ status }) => status === 'APPROVED');
      if (!strategy) throw new ApplicationError('CONFLICT', 'approved strategy is required');
      // Trend candidates are always scoped to the current workspace, Bunshin and social profile.
      // They are public-source based, so service mode can use the participant's own candidates
      // without exposing personal memories or another service's data.
      const trendIdeas = await new ListActiveTrendIdeas(
        new db.PrismaTrendResearchRepository(),
      ).execute({
        ...scope,
        socialProfileId: profile.id,
        at: new Date(),
      });
      const weeklyPlans = await new ListWeeklyPlans(new db.PrismaWeeklyPlanRepository()).execute(
        scope,
      );
      const weeklyPlan = weeklyPlans.find(
        ({ status, items }) =>
          status === 'CONFIRMED' &&
          items.some(({ scheduledDate }) => scheduledDate === input.missionDate),
      );
      if (!weeklyPlan)
        throw new ApplicationError('NOT_FOUND', 'confirmed weekly plan item not found for date');
      const weeklyItem = weeklyPlan.items.find(
        ({ scheduledDate }) => scheduledDate === input.missionDate,
      )!;
      const campaign = weeklyItem.campaignId
        ? await new CampaignService(new db.PrismaCampaignRepository()).resolvePlanningContext({
            ...scope,
            campaignId: weeklyItem.campaignId,
            at: new Date(`${input.missionDate}T12:00:00.000Z`),
          })
        : null;
      if (campaign && input.serviceSafeMode && campaign.productPack.groupId !== input.groupId)
        throw new ApplicationError('NOT_FOUND', 'service campaign unavailable');
      if (campaign) {
        const entitlements = new GroupFeatureEntitlementService(
          new db.PrismaGroupFeatureEntitlementRepository(),
        );
        for (const requiredFeature of ['SOCIAL', 'GROUP.CAMPAIGN', 'GROUP.PRODUCT_PACK']) {
          const access = await entitlements.consumeAccess({
            workspaceId: input.workspaceId,
            groupId: campaign.productPack.groupId,
            actorUserId: input.actorUserId,
            featureKey: requiredFeature,
            operationKey: `${input.generationIdempotencyKey}:${requiredFeature}`,
            localDate: input.missionDate,
          });
          if (!access.allowed)
            throw new ApplicationError('FORBIDDEN', 'group feature is not available', {
              featureKey: requiredFeature,
              reason: access.reason,
            });
        }
      }
      const pillars = await new ListContentPillars(new db.PrismaContentPillarRepository()).execute(
        scope,
      );
      const bunshin = await new GetBunshin(new db.PrismaBunshinRepository()).execute(scope);
      const personalityVersions = input.serviceSafeMode
        ? []
        : await new ListPersonalityVersions(new db.PrismaPersonalityVersionRepository()).execute(
            scope,
          );
      const currentPersonality = personalityVersions[0] ?? null;
      const granted = input.serviceSafeMode
        ? []
        : await new ListGrantedKnowledgeForBunshin(new db.PrismaKnowledgeGrantRepository()).execute(
            scope,
          );
      const generations = new db.PrismaDailyMissionGenerationRepository();
      const claim = await generations.claim({
        ...scope,
        missionDate: input.missionDate,
        idempotencyKey: input.generationIdempotencyKey,
      });
      if (!claim.acquired)
        throw new ApplicationError('CONFLICT', 'daily mission generation is in progress');
      generationId = claim.record.id;
      const { apiKey, model } = await resolveOpenAiRuntimeConfiguration();
      runtimeModel = model;
      let timezone = input.timezone;
      if (!timezone) {
        const preference = await new db.PrismaLineNotificationPreferenceRepository().getScoped(
          scope,
        );
        if (!preference.accessible)
          throw new ApplicationError('NOT_FOUND', 'notification preference scope not found');
        timezone = preference.preference?.timezone ?? 'Asia/Tokyo';
      }
      const bunshinContext = {
        name: bunshin.name,
        objectiveSummary: bunshin.objectiveSummary,
        audienceSummary: bunshin.audienceSummary,
        personalitySummary: bunshin.personalitySummary,
        personality: currentPersonality
          ? {
              versionId: currentPersonality.id,
              version: currentPersonality.version,
              tone: currentPersonality.tone,
              formality: currentPersonality.formality,
              energyLevel: currentPersonality.energyLevel,
              expertiseLevel: currentPersonality.expertiseLevel,
              sentenceStyle: currentPersonality.sentenceStyle,
              firstPerson: currentPersonality.firstPerson,
              forbiddenExpressions: currentPersonality.forbiddenExpressions,
              preferredExpressions: currentPersonality.preferredExpressions,
              visualDirection: currentPersonality.visualDirection,
              facePolicy: currentPersonality.facePolicy,
            }
          : null,
      };
      const strategyContext = {
        concept: strategy.concept,
        positioning: strategy.positioning,
        targetSummary: strategy.targetSummary,
        ctaStrategy: strategy.ctaStrategy,
        postingPolicy: strategy.postingPolicy,
      };
      const knowledge = granted.map(({ type, title, content }) => ({ type, title, content }));
      const groupKnowledge = campaign
        ? selectGroupKnowledgeChunksForPrompt(
            await new GroupKnowledgeService(
              new db.PrismaGroupKnowledgeRepository(),
            ).listApprovedChunksForGeneration({
              ...scope,
              groupId: campaign.productPack.groupId,
              productPackVersionId: campaign.productPack.versionId,
            }),
          ).map((chunk) => ({
            chunkId: chunk.id,
            sourceId: chunk.sourceId,
            type: chunk.type,
            sourceLabel: chunk.sourceLabel,
            content: chunk.content.trim(),
          }))
        : input.serviceSafeMode && input.groupId
          ? (
              await loadServiceGenerationKnowledge({
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                actorUserId: input.actorUserId,
              })
            ).groupKnowledge
          : [];
      const usage = async (
        suffix: string,
        taskType: string,
        result: {
          model: string;
          promptVersion: string;
          inputTokens: number | null;
          outputTokens: number | null;
          latencyMs: number;
        },
      ) =>
        recordAiUsageSafely({
          ...scope,
          taskType,
          provider: 'openai',
          model: result.model,
          promptVersion: result.promptVersion,
          status: 'SUCCESS',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          idempotencyKey: `${input.usageIdempotencyPrefix}:${suffix}`,
        });
      const generateWithQuota = <T>(suffix: string, generate: () => Promise<T>) =>
        withOrganizationAiGenerationQuota({
          workspaceId: input.workspaceId,
          operationKey: `${input.usageIdempotencyPrefix}:${suffix}`,
          generate,
        });
      const brief = await generateWithQuota('daily-brief', () =>
        new GenerateDailyMissionBrief(new OpenAIDailyMissionPlanner({ apiKey, model })).execute({
          ...scope,
          missionDate: input.missionDate,
          timezone,
          socialProfile: profile,
          facePolicy: bunshin.personality?.facePolicy ?? 'FULL_ANONYMOUS',
          recentFormats,
          bunshin: bunshinContext,
          approvedStrategy: strategy,
          weeklyPlan,
          contentPillars: pillars,
          grantedKnowledge: knowledge,
          trendIdeas,
          campaign,
        }),
      );
      await usage('daily-brief', 'DAILY_MISSION_PLANNER', brief);
      const pillarId = weeklyPlan.items.find(
        ({ id }) => id === brief.output.weeklyPlanItemId,
      )?.contentPillarId;
      const pillar = pillars.find(({ id }) => id === pillarId);
      if (!pillar) throw new ApplicationError('NOT_FOUND', 'active content pillar not found');
      const selectedMemories = input.serviceSafeMode
        ? []
        : await new SelectBunshinMemories(new db.PrismaBunshinMemoryRepository()).execute({
            ...scope,
            query: [
              brief.output.topic,
              brief.output.angle,
              brief.output.reason,
              pillar.title,
              pillar.description ?? '',
              strategy.targetSummary,
            ].join('\n'),
            maxItems: 5,
            maxCharacters: 3000,
          });
      const generator = new GenerateMissionContent(
        new OpenAIMissionContentGenerator({
          apiKey,
          model,
        }),
      );
      const contentInput = {
        platform: profile.platform,
        brief: brief.output,
        bunshin: bunshinContext,
        approvedStrategy: strategyContext,
        contentPillar: { title: pillar.title, description: pillar.description },
        grantedKnowledge: knowledge,
        groupKnowledge,
        selectedMemories,
        campaign,
      };
      let content = await generateWithQuota('content:0', () => generator.execute(contentInput));
      await usage('content:0', 'CONTENT_GENERATOR', content);
      const checker = new CheckMissionQuality(
        new OpenAIMissionQualityChecker({
          apiKey,
          model,
        }),
      );
      const qualityInput = () => ({
        platform: profile.platform,
        brief: brief.output,
        content: content.output,
        bunshin: bunshinContext,
        approvedStrategy: strategyContext,
        selectedMemories,
        groupKnowledge,
      });
      let repairCount = 0;
      const qualityIssueCodes = new Set<string>();
      let quality = await generateWithQuota('quality:0', () => checker.execute(qualityInput()));
      for (const issue of quality.output.issues) qualityIssueCodes.add(issue.code);
      await usage('quality:0', 'QUALITY_CHECKER', quality);
      if (quality.output.verdict === 'REVISE') {
        repairCount = 1;
        content = await generateWithQuota('content:1', () =>
          generator.execute({
            ...contentInput,
            repairInstructions: quality.output.issues.map(
              ({ repairInstruction }) => repairInstruction,
            ),
          }),
        );
        await usage('content:1', 'CONTENT_REPAIR', content);
        quality = await generateWithQuota('quality:1', () => checker.execute(qualityInput()));
        for (const issue of quality.output.issues) qualityIssueCodes.add(issue.code);
        await usage('quality:1', 'QUALITY_CHECKER', quality);
      }
      if (quality.output.verdict !== 'PASS')
        throw new ApplicationError('CONTENT_REJECTED', 'generated mission failed quality check');
      let missionContent = content.output;
      let externalLinkUsage:
        | {
            groupId: string;
            productPackId: string;
            productPackVersionId: string;
            campaignId: string;
            externalTrackingLinkId: string;
            insertedUrl: string;
            placementTemplateId: string | null;
            placementTemplateVersion: number | null;
          }
        | undefined;
      if (campaign) {
        const trackingLink = await new ExternalTrackingLinkService(
          new db.PrismaExternalTrackingLinkRepository(),
        ).resolve({
          ...scope,
          groupId: campaign.productPack.groupId,
          productPackId: campaign.productPack.productPackId,
          campaignId: campaign.id,
          at: new Date(`${input.missionDate}T12:00:00.000Z`),
        });
        if (!trackingLink && !campaign.productPack.allowLinklessPosts)
          throw new ApplicationError(
            'CONFLICT',
            'この商品に使用できる専用URLが設定されていません。管理者へお問い合わせください。',
          );
        if (trackingLink) {
          const linkAccess = await new GroupFeatureEntitlementService(
            new db.PrismaGroupFeatureEntitlementRepository(),
          ).consumeAccess({
            workspaceId: input.workspaceId,
            groupId: campaign.productPack.groupId,
            actorUserId: input.actorUserId,
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
            ...scope,
            productPackVersionId: campaign.productPack.versionId,
            platform: profile.platform,
            format: brief.output.format,
          });
          missionContent = applyExternalLinkPlacement({
            content: missionContent,
            url: trackingLink.url,
            platform: profile.platform,
            format: brief.output.format,
            placement,
          });
          externalLinkUsage = {
            groupId: campaign.productPack.groupId,
            productPackId: campaign.productPack.productPackId,
            productPackVersionId: campaign.productPack.versionId,
            campaignId: campaign.id,
            externalTrackingLinkId: trackingLink.id,
            insertedUrl: trackingLink.url,
            placementTemplateId: placement.id,
            placementTemplateVersion: placement.version,
          };
        }
      }
      const campaignSignature = campaign ? campaignContentSignature(missionContent) : null;
      const similarity =
        campaign && campaignSignature
          ? await new CampaignSafetyValidationService(
              new db.PrismaCampaignSafetyRepository(),
            ).inspect({
              ...scope,
              campaignId: campaign.id,
              ...campaignSignature,
              at: new Date(`${input.missionDate}T12:00:00.000Z`),
            })
          : null;
      if (campaign && campaignSignature && similarity?.verdict === 'POSSIBLE_DUPLICATE') {
        await new CampaignSafetyValidationService(new db.PrismaCampaignSafetyRepository()).record({
          ...scope,
          campaignId: campaign.id,
          dailyMissionId: null,
          at: new Date(`${input.missionDate}T12:00:00.000Z`),
          ...campaignSignature,
          ...similarity,
        });
        throw new ApplicationError('CONTENT_REJECTED', 'campaign content is too similar');
      }
      const advertisingInput = campaign
        ? {
            ...scope,
            productPackVersionId: campaign.productPack.versionId,
            classification: weeklyItem.classification,
            evidenceRequirement: 'NONE' as const,
            evidenceIds: [],
            officialClaims: campaign.productPack.facts,
            content: JSON.stringify(missionContent),
          }
        : null;
      if (advertisingInput) {
        const safety = await new AdvertisingSafetyService(
          new db.PrismaAdvertisingSafetyRepository(),
        ).inspect(advertisingInput);
        if (safety.inspected.verdict !== 'PASS')
          throw new ApplicationError('CONTENT_REJECTED', 'campaign content failed safety gate', {
            issueCodes: safety.inspected.issueCodes,
          });
      }
      const created = await new CreateDailyMission(missions, assignments).execute({
        ...scope,
        ...brief.output,
        assistanceLevel: profile.defaultAssistanceLevel,
        content: missionContent,
        qualityScore: quality.output.score,
        campaignId: weeklyItem.campaignId,
        classification: weeklyItem.classification,
        generationContext: {
          generatedAt: new Date(),
          payload: {
            personality: currentPersonality
              ? { id: currentPersonality.id, version: currentPersonality.version }
              : null,
            selectedMemories: selectedMemories.map(({ id, summary, selectionReason }) => ({
              id,
              summary,
              selectionReason,
            })),
            knowledge: granted.map(({ id }) => ({ id })),
            groupKnowledge: groupKnowledge.map(({ chunkId }) => ({ id: chunkId })),
            socialProfile: { id: profile.id },
            strategy: { id: strategy.id, version: strategy.version },
            weeklyPlan: { id: weeklyPlan.id },
            contentPillar: { id: pillar.id },
            productPack: campaign
              ? { id: campaign.productPack.versionId, version: campaign.productPack.version }
              : productPack
                ? { id: productPack.versionId, version: productPack.version }
                : null,
            campaign: campaign ? { id: campaign.id } : null,
            classification: weeklyItem.classification,
            trendCandidates: brief.output.trendCandidateId
              ? [{ id: brief.output.trendCandidateId }]
              : [],
            promptVersion: content.promptVersion,
            provider: 'openai',
            model: content.model,
            quality: {
              verdict: 'PASS',
              issueCodes: [...qualityIssueCodes],
              repairCount,
            },
          },
        },
        ...(externalLinkUsage ? { externalLinkUsage } : {}),
      });
      if (advertisingInput)
        await new AdvertisingSafetyService(new db.PrismaAdvertisingSafetyRepository()).review({
          ...advertisingInput,
          dailyMissionId: created.id,
        });
      if (campaign && campaignSignature && similarity)
        await new CampaignSafetyValidationService(new db.PrismaCampaignSafetyRepository()).record({
          ...scope,
          campaignId: campaign.id,
          dailyMissionId: created.id,
          at: new Date(`${input.missionDate}T12:00:00.000Z`),
          ...campaignSignature,
          ...similarity,
        });
      try {
        await generations.complete({ ...scope, id: claim.record.id, dailyMissionId: created.id });
      } catch {
        logger.error('daily mission generation observation update failed', {
          errorCode: 'OBSERVATION_UPDATE_FAILED',
        });
      }
      return created;
    } catch (error) {
      if (generationId) {
        await recordAiUsageSafely({
          ...scope,
          taskType: 'DAILY_MISSION_PIPELINE',
          provider: 'openai',
          model: runtimeModel,
          promptVersion: 'daily-mission-pipeline-v1',
          status: 'FAILED',
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - started,
          errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
          idempotencyKey: `${input.usageIdempotencyPrefix}:daily-pipeline-failure`,
        });
        try {
          const generations = new db.PrismaDailyMissionGenerationRepository();
          await generations.fail({
            ...scope,
            id: generationId,
            errorCategory: errorCategory(error),
          });
        } catch {
          logger.error('daily mission generation failure state update failed', {
            errorCode: 'OBSERVATION_UPDATE_FAILED',
          });
        }
      }
      throw error;
    }
  }
}

export const createDailyMissionGenerationService = () => new DailyMissionGenerationService();
