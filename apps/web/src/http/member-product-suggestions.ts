import 'server-only';
import {
  ExternalTrackingMemberLinkService,
  GetBunshin,
  MemberProductProfileService,
  finalizeMemberProductCandidate,
} from '@bunshin/application';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import {
  MEMBER_PRODUCT_SUGGESTION_PROMPT_VERSION,
  OpenAIMemberProductSuggestionGenerator,
} from '../providers/openai-member-product-suggestion-generator';
import { resolvePublicServiceContext } from '../services/public-service';

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
  const started = Date.now();
  let usage:
    | {
        workspaceId: string;
        bunshinId: string;
        actorUserId: string;
        model: string;
        requestCostUsdMicros: number;
      }
    | undefined;
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, input] = await Promise.all([
      resolvePublicServiceContext(serviceSlug),
      inputSchema.parseAsync(await request.json()),
    ]);
    const db = await import('@bunshin/database');
    const scope = {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
    };
    const profileService = new MemberProductProfileService(
      new db.PrismaMemberProductProfileRepository(),
    );
    const [bunshin, profile, settings, runtime] = await Promise.all([
      new GetBunshin(new db.PrismaBunshinRepository()).execute({
        ...scope,
        bunshinId: input.bunshinId,
      }),
      profileService.getGenerationContext({ ...scope, profileId: input.profileId }),
      new ExternalTrackingMemberLinkService(
        new db.PrismaExternalTrackingLinkRepository(undefined, service.serviceId),
      ).list(scope),
      resolveOpenAiRuntimeConfiguration(),
    ]);
    const link = settings.links.find(
      (item) => item.id === profile.externalTrackingLinkId && item.status === 'ACTIVE',
    );
    if (!link) throw new ApplicationError('NOT_FOUND', 'active member product profile unavailable');
    if (profile.productPackId && !profile.officialProduct)
      throw new ApplicationError('CONTENT_REJECTED', 'official product information unavailable');
    usage = {
      workspaceId: scope.workspaceId,
      bunshinId: bunshin.id,
      actorUserId: actor.userId,
      model: runtime.model,
      requestCostUsdMicros: runtime.requestCostUsdMicros,
    };
    const result = await withOrganizationAiGenerationQuota({
      workspaceId: scope.workspaceId,
      operationKey: `${requestId}:member-product-suggestions`,
      generate: () =>
        new OpenAIMemberProductSuggestionGenerator({
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
        }),
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
    const { generationId } = await profileService.recordGeneration({
      ...scope,
      profileId: profile.id,
      bunshinId: bunshin.id,
      platform: input.platform,
    });
    await recordAiUsageSafely({
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
      estimatedCostUsdMicros: runtime.requestCostUsdMicros || null,
      pricingVersion: runtime.requestCostUsdMicros ? 'admin-request-cost-v1' : null,
      idempotencyKey: `${requestId}:member-product-suggestions`,
    });
    logger.info('member product suggestions generated', {
      workspaceId: scope.workspaceId,
      bunshinId: bunshin.id,
      model: result.model,
      promptVersion: result.promptVersion,
      latency: result.latencyMs,
    });
    return Response.json(
      { data: { candidates, generationId }, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (usage) {
      const { requestCostUsdMicros, ...usageScope } = usage;
      await recordAiUsageSafely({
        ...usageScope,
        taskType: 'MEMBER_PRODUCT_COPY_GENERATOR',
        provider: 'openai',
        promptVersion: MEMBER_PRODUCT_SUGGESTION_PROMPT_VERSION,
        status: 'FAILED',
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - started,
        estimatedCostUsdMicros: requestCostUsdMicros || null,
        pricingVersion: requestCostUsdMicros ? 'admin-request-cost-v1' : null,
        errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
        idempotencyKey: `${requestId}:member-product-suggestions`,
      });
    }
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
