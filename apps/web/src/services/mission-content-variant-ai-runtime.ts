import 'server-only';
import {
  CheckMissionQuality,
  GenerateMissionContent,
  type DailyMission,
  type DailyMissionScope,
  type MissionQualityCheckerOutput,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import {
  reserveOpenAiRuntimeConfiguration,
  type AdmittedOpenAiRuntimeConfiguration,
} from '../ai/runtime-provider-configuration';
import { recordOpenAiUsageAndSettle } from '../ai/openai-cost-admission';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import {
  MISSION_CONTENT_GENERATOR_PROMPT_VERSION,
  OpenAIMissionContentGenerator,
} from '../providers/openai-mission-content-generator';
import {
  MISSION_QUALITY_CHECKER_PROMPT_VERSION,
  OpenAIMissionQualityChecker,
} from '../providers/openai-mission-quality-checker';
import {
  OpenAiPhotoFirstAnalyzer,
  PHOTO_FIRST_ANALYSIS_PROMPT_VERSION,
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
  const executeAiStep = async <
    T extends {
      model: string;
      promptVersion: string;
      inputTokens: number | null;
      outputTokens: number | null;
      latencyMs: number;
    },
  >(operation: {
    suffix: string;
    taskType: string;
    promptVersion: string;
    generate: (runtime: AdmittedOpenAiRuntimeConfiguration) => Promise<T>;
  }) => {
    const operationKey = `${input.usageIdempotencyPrefix}:${operation.suffix}`;
    const runtime = await reserveOpenAiRuntimeConfiguration(operationKey);
    input.usageState.runtimeModel = runtime.model;
    const startedAt = Date.now();
    let providerAttempted = false;
    let usagePending = true;
    try {
      const result = await withOrganizationAiGenerationQuota({
        workspaceId: input.scope.workspaceId,
        ...(input.scope.groupId === undefined ? {} : { groupId: input.scope.groupId }),
        operationKey,
        generate: () => {
          providerAttempted = true;
          return operation.generate(runtime);
        },
      });
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
      usagePending = false;
      await recordOpenAiUsageAndSettle(runtime, {
        contentVariantGenerationId: input.generationId,
        ...input.scope,
        taskType: operation.taskType,
        provider: 'openai',
        model: result.model,
        promptVersion: result.promptVersion,
        status: 'SUCCESS',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        estimatedCostUsdMicros: runtime.requestCostUsdMicros || null,
        pricingVersion: runtime.requestCostUsdMicros ? 'admin-request-cost-v1' : null,
        idempotencyKey: operationKey,
      });
      return result;
    } catch (error) {
      if (usagePending) {
        usagePending = false;
        if (providerAttempted) {
          input.usageState.estimatedCostMicros += runtime.requestCostUsdMicros;
          input.usageState.requestCount += 1;
        }
        await recordOpenAiUsageAndSettle(runtime, {
          contentVariantGenerationId: input.generationId,
          ...input.scope,
          taskType: operation.taskType,
          provider: 'openai',
          model: runtime.model,
          promptVersion: operation.promptVersion,
          status: 'FAILED',
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - startedAt,
          estimatedCostUsdMicros: providerAttempted ? runtime.requestCostUsdMicros : 0,
          pricingVersion:
            providerAttempted && runtime.requestCostUsdMicros ? 'admin-request-cost-v1' : null,
          errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
          idempotencyKey: operationKey,
        });
      }
      throw error;
    }
  };
  const { context, mission } = input;
  let photoFirst: PhotoFirstAnalysisResult | null = null;
  if (input.photoFirst) {
    try {
      photoFirst = await executeAiStep({
        suffix: 'photo-first-analysis',
        taskType: 'PHOTO_FIRST_ANALYSIS',
        promptVersion: PHOTO_FIRST_ANALYSIS_PROMPT_VERSION,
        generate: (runtime) =>
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
      });
    } catch (error) {
      if (error instanceof PhotoFirstAnalysisError)
        throw new ApplicationError(
          error.retryable ? 'AI_PROVIDER_UNAVAILABLE' : 'CONTENT_REJECTED',
          '写真を読み取れませんでした',
          error,
        );
      throw error;
    }
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
  let content = await executeAiStep({
    suffix: 'variant-content:0',
    taskType: 'MISSION_CONTENT_VARIANT',
    promptVersion: MISSION_CONTENT_GENERATOR_PROMPT_VERSION,
    generate: (runtime) =>
      new GenerateMissionContent(
        new OpenAIMissionContentGenerator({ apiKey: runtime.apiKey, model: runtime.model }),
      ).execute(contentInput),
  });
  content = {
    ...content,
    output: applyServiceContentTerminology(content.output, context.contentTerminologyPolicy),
  };
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
  let quality = await executeAiStep({
    suffix: 'variant-quality:0',
    taskType: 'QUALITY_CHECKER',
    promptVersion: MISSION_QUALITY_CHECKER_PROMPT_VERSION,
    generate: (runtime) =>
      new CheckMissionQuality(
        new OpenAIMissionQualityChecker({ apiKey: runtime.apiKey, model: runtime.model }),
      ).execute(qualityInput()),
  });
  input.usageState.qualityAttempts.push(quality.output);
  if (quality.output.verdict === 'REVISE') {
    input.usageState.qualityRepairCount += 1;
    content = await executeAiStep({
      suffix: 'variant-content:1',
      taskType: 'MISSION_CONTENT_VARIANT_REPAIR',
      promptVersion: MISSION_CONTENT_GENERATOR_PROMPT_VERSION,
      generate: (runtime) =>
        new GenerateMissionContent(
          new OpenAIMissionContentGenerator({ apiKey: runtime.apiKey, model: runtime.model }),
        ).execute({
          ...contentInput,
          repairInstructions: quality.output.issues.map(
            ({ repairInstruction }) => repairInstruction,
          ),
        }),
    });
    content = {
      ...content,
      output: applyServiceContentTerminology(content.output, context.contentTerminologyPolicy),
    };
    quality = await executeAiStep({
      suffix: 'variant-quality:1',
      taskType: 'QUALITY_CHECKER',
      promptVersion: MISSION_QUALITY_CHECKER_PROMPT_VERSION,
      generate: (runtime) =>
        new CheckMissionQuality(
          new OpenAIMissionQualityChecker({ apiKey: runtime.apiKey, model: runtime.model }),
        ).execute(qualityInput()),
    });
    input.usageState.qualityAttempts.push(quality.output);
  }
  if (quality.output.verdict !== 'PASS')
    throw new ApplicationError('CONTENT_REJECTED', 'generated variant failed quality check');

  return { content, quality, photoFirst };
}
