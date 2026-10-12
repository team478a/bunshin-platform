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
  const configuration = await resolveOpenAiRuntimeConfiguration(undefined, 'SOCIAL_PLANNER');
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
      estimatedCostUsdMicros: configuration.requestCostUsdMicros || null,
      pricingVersion: configuration.requestCostUsdMicros ? 'admin-request-cost-v1' : null,
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
    const providerFailure = dailyMissionProviderFailureDetails(error);
    if (providerFailure?.providerFailureReason)
      return `AI_PROVIDER_${providerFailure.providerFailureReason}`.slice(0, 80);
    if (providerFailure?.providerHttpStatus)
      return `AI_PROVIDER_HTTP_${providerFailure.providerHttpStatus}`;
    return error.code;
  }
  return 'INTERNAL_ERROR';
}

const providerFailureReasons = new Set([
  'TIMEOUT',
  'NETWORK_ERROR',
  'RESPONSE_READ_ERROR',
  'INVALID_JSON',
  'EMPTY_RESPONSE',
  'MALFORMED_RESPONSE',
  'MALFORMED_OUTPUT',
]);

/**
 * Returns only bounded provider diagnostics that are safe to persist or log.
 * Response bodies, request payloads and credentials are intentionally ignored.
 */
export function dailyMissionProviderFailureDetails(error: unknown) {
  if (!(error instanceof ApplicationError) || error.code !== 'AI_PROVIDER_UNAVAILABLE') return null;
  const cause = error.cause;
  if (!cause || typeof cause !== 'object') return {};
  const value = cause as {
    reason?: unknown;
    httpStatus?: unknown;
    providerErrorCode?: unknown;
  };
  const providerFailureReason =
    typeof value.reason === 'string' && providerFailureReasons.has(value.reason)
      ? value.reason
      : undefined;
  const providerHttpStatus =
    typeof value.httpStatus === 'number' &&
    Number.isInteger(value.httpStatus) &&
    value.httpStatus >= 100 &&
    value.httpStatus <= 599
      ? value.httpStatus
      : undefined;
  const providerErrorCode =
    typeof value.providerErrorCode === 'string' &&
    /^[A-Za-z0-9_-]{1,100}$/.test(value.providerErrorCode)
      ? value.providerErrorCode
      : undefined;
  return {
    ...(providerFailureReason ? { providerFailureReason } : {}),
    ...(providerHttpStatus ? { providerHttpStatus } : {}),
    ...(providerErrorCode ? { providerErrorCode } : {}),
  };
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
