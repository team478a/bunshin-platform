import 'server-only';
import {
  ExternalTrackingMemberLinkService,
  GetBunshin,
  MemberProductActivityService,
  MemberProductProfileService,
  finalizeMemberProductCandidate,
} from '@bunshin/application';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import {
  reserveOpenAiRuntimeConfiguration,
  settleProviderRuntimeAdmission,
} from '../ai/runtime-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { recordAiUsage, recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import {
  MEMBER_PRODUCT_SUGGESTION_PROMPT_VERSION,
  OpenAIMemberProductSuggestionGenerator,
} from '../providers/openai-member-product-suggestion-generator';
import { resolveMemberServiceContext } from '../services/public-service';

const logger = createLogger();
const inputSchema = z
  .object({
    profileId: z.string().uuid(),
    bunshinId: z.string().uuid(),
    platform: z.enum(['INSTAGRAM', 'X', 'THREADS']),
  })
  .strict();

export async function generateMemberProductSuggestionsResponse(
  request: Request,
  serviceSlug: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const operationKey = `${requestId}:member-product-suggestions`;
  const started = Date.now();
  let usage:
    | {
        workspaceId: string;
        bunshinId: string;
        actorUserId: string;
        model: string;
        requestCostUsdMicros: number;
        admission: Awaited<ReturnType<typeof reserveOpenAiRuntimeConfiguration>>['admission'];
      }
    | undefined;
  let providerAttempted = false;
  let usagePersistenceStarted = false;
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, parsed] = await Promise.all([
      resolveMemberServiceContext(serviceSlug, actor.userId),
      inputSchema.safeParseAsync(await request.json()),
    ]);
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid suggestion body');
    const input = parsed.data;
    const db = await import('@bunshin/database');
    const scope = {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
    };
    const [bunshin, profile, settings] = await Promise.all([
      new GetBunshin(new db.PrismaBunshinRepository()).execute({
        ...scope,
        bunshinId: input.bunshinId,
      }),
      new MemberProductProfileService(
        new db.PrismaMemberProductProfileRepository(),
      ).getGenerationContext({ ...scope, profileId: input.profileId }),
      new ExternalTrackingMemberLinkService(
        new db.PrismaExternalTrackingLinkRepository(undefined, service.serviceId),
      ).list(scope),
    ]);
    const link = settings.links.find(
      (item) => item.id === profile.externalTrackingLinkId && item.status === 'ACTIVE',
    );
    if (!link) throw new ApplicationError('NOT_FOUND', 'active member product profile unavailable');
    if (profile.productPackId && !profile.officialProduct)
      throw new ApplicationError('CONTENT_REJECTED', 'official product information unavailable');
    const runtime = await reserveOpenAiRuntimeConfiguration(operationKey);
    usage = {
      workspaceId: scope.workspaceId,
      bunshinId: bunshin.id,
      actorUserId: actor.userId,
      model: runtime.model,
      requestCostUsdMicros: runtime.requestCostUsdMicros,
      admission: runtime.admission,
    };
    const result = await withOrganizationAiGenerationQuota({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      operationKey,
      generate: () => {
        providerAttempted = true;
        return new OpenAIMemberProductSuggestionGenerator({
          apiKey: runtime.apiKey,
          model: runtime.model,
        }).generate({
          platform: input.platform,
          product: {
            name: profile.name,
            appealPoint: profile.appealPoint,
            targetAudience: profile.targetAudience,
          },
          officialProduct: profile.officialProduct,
          bunshin: {
            name: bunshin.name,
            objectiveSummary: bunshin.objectiveSummary,
            audienceSummary: bunshin.audienceSummary,
            personalitySummary: bunshin.personalitySummary,
            tone: bunshin.personality?.tone ?? null,
            firstPerson: bunshin.personality?.firstPerson ?? null,
            preferredExpressions: bunshin.personality?.preferredExpressions ?? [],
            forbiddenExpressions: bunshin.personality?.forbiddenExpressions ?? [],
          },
        });
      },
    });
    const candidates = result.candidates.map((draft) =>
      finalizeMemberProductCandidate({
        draft,
        approvedUrl: link.url,
        platform: input.platform,
        requiredDisclosures: profile.officialProduct?.requiredDisclosures,
        forbiddenExpressions: [
          ...(bunshin.personality?.forbiddenExpressions ?? []),
          ...(profile.officialProduct?.forbiddenExpressions ?? []),
        ],
      }),
    );
    const successUsage = {
      workspaceId: scope.workspaceId,
      bunshinId: bunshin.id,
      actorUserId: actor.userId,
      taskType: 'MEMBER_PRODUCT_COPY_GENERATOR',
      provider: 'openai',
      model: result.model,
      promptVersion: result.promptVersion,
      status: 'SUCCESS',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      estimatedCostUsdMicros: runtime.requestCostUsdMicros,
      pricingVersion: 'admin-request-cost-v1',
      idempotencyKey: operationKey,
    } as const;
    usagePersistenceStarted = true;
    if (runtime.admission) await recordAiUsage(successUsage);
    else await recordAiUsageSafely(successUsage);
    if (runtime.admission) await settleProviderRuntimeAdmission(runtime.admission);
    const activity = await new MemberProductActivityService(
      new db.PrismaMemberProductActivityRepository(),
    ).recordGeneration({
      ...scope,
      profileId: profile.id,
      bunshinId: bunshin.id,
      externalTrackingLinkId: profile.externalTrackingLinkId,
      productPackId: profile.productPackId,
      platform: input.platform,
      candidateCount: candidates.length,
      operationKey,
    });
    logger.info('member product suggestions generated', {
      workspaceId: scope.workspaceId,
      bunshinId: bunshin.id,
      model: result.model,
      promptVersion: result.promptVersion,
      latency: result.latencyMs,
    });
    return Response.json(
      { data: { candidates, activityId: activity.id }, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (usage && !usagePersistenceStarted) {
      const { requestCostUsdMicros, admission, ...usageScope } = usage;
      const failedUsage = {
        ...usageScope,
        taskType: 'MEMBER_PRODUCT_COPY_GENERATOR',
        provider: 'openai',
        promptVersion: MEMBER_PRODUCT_SUGGESTION_PROMPT_VERSION,
        status: 'FAILED',
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - started,
        estimatedCostUsdMicros: providerAttempted ? requestCostUsdMicros : 0,
        pricingVersion: 'admin-request-cost-v1',
        errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
        idempotencyKey: operationKey,
      } as const;
      usagePersistenceStarted = true;
      if (admission) await recordAiUsage(failedUsage);
      else await recordAiUsageSafely(failedUsage);
      if (admission) await settleProviderRuntimeAdmission(admission);
    }
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
