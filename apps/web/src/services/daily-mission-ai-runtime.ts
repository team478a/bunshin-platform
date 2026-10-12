import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import {
  reserveOpenAiRuntimeConfiguration,
  type AdmittedOpenAiRuntimeConfiguration,
} from '../ai/runtime-provider-configuration';
import { recordOpenAiUsageAndSettle } from '../ai/openai-cost-admission';
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

export function createDailyMissionAiRuntime(input: {
  scope: DailyMissionAiScope;
  usageIdempotencyPrefix: string;
}) {
  const execute = async <T extends AiOperationResult>(operation: {
    suffix: string;
    taskType: string;
    promptVersion: string;
    generate: (runtime: AdmittedOpenAiRuntimeConfiguration) => Promise<T>;
  }) => {
    const operationKey = `${input.usageIdempotencyPrefix}:${operation.suffix}`;
    const runtime = await reserveOpenAiRuntimeConfiguration(
      operationKey,
      undefined,
      'SOCIAL_PLANNER',
    );
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
      usagePending = false;
      await recordOpenAiUsageAndSettle(runtime, {
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
        await recordOpenAiUsageAndSettle(runtime, {
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
          errorCode: dailyMissionErrorCategory(error),
          idempotencyKey: operationKey,
        });
      }
      throw error;
    }
  };

  return { execute };
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
