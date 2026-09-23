import 'server-only';
import {
  CheckMissionQuality,
  GenerateMissionContent,
  type DailyMission,
  type DailyMissionScope,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import { OpenAIMissionContentGenerator } from '../providers/openai-mission-content-generator';
import { OpenAIMissionQualityChecker } from '../providers/openai-mission-quality-checker';
import {
  recentMissionQualityContext,
  type RecentDailyMissionContent,
} from './daily-mission-content-quality';
import type { MissionContentVariantContext } from './mission-content-variant-context';
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
}

export const createMissionContentVariantUsageState = (): MissionContentVariantUsageState => ({
  runtimeModel: process.env['OPENAI_MODEL'] ?? 'gpt-5.2',
  totalInputTokens: 0,
  totalOutputTokens: 0,
  hasInputTokens: false,
  hasOutputTokens: false,
  estimatedCostMicros: 0,
  requestCount: 0,
});

export async function generateMissionContentVariantWithAi(input: {
  scope: DailyMissionScope;
  mission: DailyMission;
  recentMissions: RecentDailyMissionContent[];
  context: MissionContentVariantContext;
  usageIdempotencyPrefix: string;
  variantInstructions?: string[];
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
  });
  let quality = await generateWithQuota('variant-quality:0', () => checker.execute(qualityInput()));
  await usage('variant-quality:0', 'QUALITY_CHECKER', quality);
  if (quality.output.verdict === 'REVISE') {
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
    await usage('variant-quality:1', 'QUALITY_CHECKER', quality);
  }
  if (quality.output.verdict !== 'PASS')
    throw new ApplicationError('CONTENT_REJECTED', 'generated variant failed quality check');

  return { content, quality };
}
