import 'server-only';
import {
  CheckMissionQuality,
  GenerateMissionContent,
  type DailyMission,
  type DailyMissionScope,
  type MissionQualityCheckerOutput,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import { OpenAIMissionContentGenerator } from '../providers/openai-mission-content-generator';
import { OpenAIMissionQualityChecker } from '../providers/openai-mission-quality-checker';
import {
  OpenAiPhotoFirstAnalyzer,
  PhotoFirstAnalysisError,
  type PhotoFirstAnalysisResult,
} from '../providers/openai-photo-first-analyzer';
import {
  recentMissionQualityContext,
  type RecentDailyMissionContent,
} from './daily-mission-content-quality';
import type { MissionContentVariantContext } from './mission-content-variant-context';
import { photoFirstVariantInstructions } from './photo-first-variant-instructions';
import { applyServiceContentTerminology } from './service-content-terminology';

export interface MissionContentVariantUsageState {
  runtimeModel: string;
  promptVersion?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  hasInputTokens: boolean;
  hasOutputTokens: boolean;
  estimatedCostMicros: number;
  requestCount: number;
  qualityAttempts: MissionQualityCheckerOutput[];
  qualityRepairCount: number;
}

export const createMissionContentVariantUsageState = (): MissionContentVariantUsageState => ({
  runtimeModel: process.env['OPENAI_MODEL'] ?? 'gpt-5.2',
  totalInputTokens: 0,
  totalOutputTokens: 0,
  hasInputTokens: false,
  hasOutputTokens: false,
  estimatedCostMicros: 0,
  requestCount: 0,
  qualityAttempts: [],
  qualityRepairCount: 0,
});

export async function generateMissionContentVariantWithAi(input: {
  generationId: string;
  scope: DailyMissionScope;
  mission: DailyMission;
  recentMissions: RecentDailyMissionContent[];
  context: MissionContentVariantContext;
  usageIdempotencyPrefix: string;
  variantInstructions?: string[];
  photoFirst?: {
    bytes: Uint8Array;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    sourceNote: string;
  };
  photoFirstConfirmation?: { question: string; answer: string };
  usageState: MissionContentVariantUsageState;
}) {
  const runtime = await resolveOpenAiRuntimeConfiguration();
  input.usageState.runtimeModel = runtime.model;
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
  ) => {
    input.usageState.promptVersion = result.promptVersion;
    if (result.inputTokens !== null) {
      input.usageState.hasInputTokens = true;
      input.usageState.totalInputTokens += result.inputTokens;
    }
    if (result.outputTokens !== null) {
      input.usageState.hasOutputTokens = true;
      input.usageState.totalOutputTokens += result.outputTokens;
    }
    input.usageState.estimatedCostMicros += runtime.requestCostUsdMicros;
    input.usageState.requestCount += 1;
    await recordAiUsageSafely({
      contentVariantGenerationId: input.generationId,
      ...input.scope,
      taskType,
      provider: 'openai',
      model: result.model,
      promptVersion: result.promptVersion,
      status: 'SUCCESS',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      estimatedCostUsdMicros: runtime.requestCostUsdMicros || null,
      pricingVersion: runtime.requestCostUsdMicros ? 'admin-request-cost-v1' : null,
      idempotencyKey: `${input.usageIdempotencyPrefix}:${suffix}`,
    });
  };
  const generateWithQuota = <T>(suffix: string, generate: () => Promise<T>) =>
    withOrganizationAiGenerationQuota({
      workspaceId: input.scope.workspaceId,
      ...(input.scope.groupId === undefined ? {} : { groupId: input.scope.groupId }),
      operationKey: `${input.usageIdempotencyPrefix}:${suffix}`,
      generate,
    });
  const { context, mission } = input;
  let photoFirst: PhotoFirstAnalysisResult | null = null;
  if (input.photoFirst) {
    try {
      photoFirst = await generateWithQuota('photo-first-analysis', () =>
        new OpenAiPhotoFirstAnalyzer({ apiKey: runtime.apiKey, model: runtime.model }).analyze({
          ...input.photoFirst!,
          company: {
            name: context.bunshinContext.name,
            objectiveSummary: context.bunshinContext.objectiveSummary,
            audienceSummary: context.bunshinContext.audienceSummary,
            personalitySummary: context.bunshinContext.personalitySummary,
            businessProfile: context.businessProfile,
          },
          strategy: {
            goal: context.strategyContext.goal,
            goalPlanning: context.strategyContext.goalPlanning,
            concept: context.strategyContext.concept,
            positioning: context.strategyContext.positioning,
            targetSummary: context.strategyContext.targetSummary,
            ctaStrategy: context.strategyContext.ctaStrategy,
          },
          platform: context.profile.platform,
          mission: { topic: mission.topic, angle: mission.angle, reason: mission.reason },
          recentPosts: input.recentMissions
            .slice(-12)
            .map(({ topic, angle }) => ({ topic, angle })),
          ...(input.photoFirstConfirmation ? { confirmation: input.photoFirstConfirmation } : {}),
        }),
      );
    } catch (error) {
      if (error instanceof PhotoFirstAnalysisError)
        throw new ApplicationError(
          error.retryable ? 'AI_PROVIDER_UNAVAILABLE' : 'CONTENT_REJECTED',
          '写真を読み取れませんでした',
          error,
        );
      throw error;
    }
    await usage('photo-first-analysis', 'PHOTO_FIRST_ANALYSIS', photoFirst);
  }
  const brief = {
    missionDate: mission.missionDate,
    socialProfileId: context.profile.id,
    weeklyPlanItemId: mission.weeklyPlanItemId!,
    format: mission.format,
    topic: mission.topic,
    angle: mission.angle,
    reason: mission.reason,
    estimatedMinutes: mission.estimatedMinutes,
    campaignId: mission.campaignId,
    classification: mission.classification,
  };
  const contentInput = {
    platform: context.profile.platform,
    brief,
    bunshin: context.bunshinContext,
    approvedStrategy: context.strategyContext,
    contentPillar: context.contentPillar,
    grantedKnowledge: context.knowledge,
    businessProfile: context.businessProfile,
    groupKnowledge: context.groupKnowledge,
    recentContent: recentMissionQualityContext(input.recentMissions),
    selectedMemories: context.selectedMemories,
    campaign: context.campaign,
    variantSourceContent: mission.content,
    variantInstructions: [
      '原案と同じ目的、確認済み事実、CTA、開示、許可済みURLを維持する',
      '導入のフック、文章構成、具体例、言葉選びを明確に変える',
      '原案の表面的な言い換えにせず、同じユーザーが比較して選べる別案にする',
      ...(photoFirst
        ? photoFirstVariantInstructions({
            ...photoFirst,
            ...(input.photoFirstConfirmation ? { confirmation: input.photoFirstConfirmation } : {}),
          })
        : []),
      ...(input.variantInstructions ?? []),
    ],
  };
  const generator = new GenerateMissionContent(
    new OpenAIMissionContentGenerator({ apiKey: runtime.apiKey, model: runtime.model }),
  );
  let content = await generateWithQuota('variant-content:0', () => generator.execute(contentInput));
  content = {
    ...content,
    output: applyServiceContentTerminology(content.output, context.contentTerminologyPolicy),
  };
  await usage('variant-content:0', 'MISSION_CONTENT_VARIANT', content);
  const checker = new CheckMissionQuality(
    new OpenAIMissionQualityChecker({ apiKey: runtime.apiKey, model: runtime.model }),
  );
  const qualityInput = () => ({
    platform: context.profile.platform,
    brief,
    content: content.output,
    bunshin: context.bunshinContext,
    approvedStrategy: context.strategyContext,
    businessProfile: context.businessProfile,
    selectedMemories: context.selectedMemories,
    groupKnowledge: context.groupKnowledge,
    ...(photoFirst
      ? {
          photoFirstGrounding: {
            uncertainElements: photoFirst.analysis.uncertainElements,
            pendingQuestion: photoFirst.planning.confirmationQuestion,
            answeredConfirmation: input.photoFirstConfirmation ?? null,
          },
        }
      : {}),
  });
  let quality = await generateWithQuota('variant-quality:0', () => checker.execute(qualityInput()));
  input.usageState.qualityAttempts.push(quality.output);
  await usage('variant-quality:0', 'QUALITY_CHECKER', quality);
  if (quality.output.verdict === 'REVISE') {
    input.usageState.qualityRepairCount += 1;
    content = await generateWithQuota('variant-content:1', () =>
      generator.execute({
        ...contentInput,
        repairInstructions: quality.output.issues.map(({ repairInstruction }) => repairInstruction),
      }),
    );
    content = {
      ...content,
      output: applyServiceContentTerminology(content.output, context.contentTerminologyPolicy),
    };
    await usage('variant-content:1', 'MISSION_CONTENT_VARIANT_REPAIR', content);
    quality = await generateWithQuota('variant-quality:1', () => checker.execute(qualityInput()));
    input.usageState.qualityAttempts.push(quality.output);
    await usage('variant-quality:1', 'QUALITY_CHECKER', quality);
  }
  if (quality.output.verdict !== 'PASS')
    throw new ApplicationError('CONTENT_REJECTED', 'generated variant failed quality check');

  return { content, quality, photoFirst };
}
