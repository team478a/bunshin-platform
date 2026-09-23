import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';

export interface DailyMissionAiScope {
  workspaceId: string;
  groupId?: string | null;
  bunshinId: string;
  actorUserId: string;
}

interface AiOperationResult {
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export async function createDailyMissionAiRuntime(input: {
  scope: DailyMissionAiScope;
  usageIdempotencyPrefix: string;
}) {
  const configuration = await resolveOpenAiRuntimeConfiguration();
  const recordUsage = (suffix: string, taskType: string, result: AiOperationResult) =>
    recordAiUsageSafely({
      ...input.scope,
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
      workspaceId: input.scope.workspaceId,
      ...(input.scope.groupId === undefined ? {} : { groupId: input.scope.groupId }),
      operationKey: `${input.usageIdempotencyPrefix}:${suffix}`,
      generate,
    });

  return { ...configuration, recordUsage, generateWithQuota };
}

export function dailyMissionErrorCategory(error: unknown) {
  if (error instanceof ApplicationError) {
    const cause = error.cause;
    if (cause && typeof cause === 'object' && 'category' in cause) {
      const category = (cause as { category?: unknown }).category;
      if (typeof category === 'string') return category;
    }
    return error.code;
  }
  return 'INTERNAL_ERROR';
}

export function recordDailyMissionPipelineFailure(input: {
  scope: DailyMissionAiScope;
  usageIdempotencyPrefix: string;
  model: string;
  startedAt: number;
  error: unknown;
}) {
  return recordAiUsageSafely({
    ...input.scope,
    taskType: 'DAILY_MISSION_PIPELINE',
    provider: 'openai',
    model: input.model,
    promptVersion: 'daily-mission-pipeline-v1',
    status: 'FAILED',
    inputTokens: null,
    outputTokens: null,
    latencyMs: Date.now() - input.startedAt,
    errorCode: input.error instanceof ApplicationError ? input.error.code : 'INTERNAL_ERROR',
    idempotencyKey: `${input.usageIdempotencyPrefix}:daily-pipeline-failure`,
  });
}
