import 'server-only';
import { GetBunshin } from '@bunshin/application';
import {
  ApproveSocialAccountStrategy,
  CreateSocialAccountStrategy,
  GenerateSocialAccountStrategy,
  ListSocialAccountStrategies,
  SOCIAL_ACCOUNT_STRATEGY_DESTINATIONS,
  SOCIAL_ACCOUNT_STRATEGY_GOALS,
  SOCIAL_PLATFORMS,
  type SocialAccountStrategy,
} from '@bunshin/capability-social';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { resolvePublicServiceContext } from '../services/public-service';

const uuidSchema = z.string().uuid();
const generateSchema = z
  .object({
    socialProfileId: uuidSchema,
    platform: z.enum(SOCIAL_PLATFORMS),
    goal: z.enum(SOCIAL_ACCOUNT_STRATEGY_GOALS),
    availableMinutes: z.union([z.literal(3), z.literal(5), z.literal(10), z.literal(20)]),
    destinationType: z.enum(SOCIAL_ACCOUNT_STRATEGY_DESTINATIONS),
    destinationDetail: z.string().nullable().optional(),
    wizardTopic: z.string().min(1).max(1000),
    wizardAudience: z.string().min(1).max(1000),
  })
  .strict();
const emptySchema = z.object({}).strict();

function resourceId(value: string) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid resource id');
  return parsed.data;
}

async function actorUserId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

async function body(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return await request.json();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function scope(serviceSlug: string, bunshinId: string) {
  const [service, actor] = await Promise.all([
    resolvePublicServiceContext(serviceSlug),
    actorUserId(),
  ]);
  return {
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    bunshinId,
    actorUserId: actor,
  };
}

async function repositories() {
  const db = await import('@bunshin/database');
  return {
    assignments: new db.PrismaBunshinCapabilityAssignmentRepository(),
    bunshins: new db.PrismaBunshinRepository(),
    profiles: new db.PrismaSocialProfileRepository(),
    strategies: new db.PrismaSocialAccountStrategyRepository(),
  };
}

const dto = (value: SocialAccountStrategy) => ({
  ...value,
  approvedAt: value.approvedAt?.toISOString() ?? null,
  supersededAt: value.supersededAt?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});

async function respond(
  request: Request,
  operation: () => Promise<unknown>,
  status = 200,
  suppliedRequestId?: string,
) {
  const requestId = suppliedRequestId ?? requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { status, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

export function listServiceAccountStrategiesResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  socialProfileId: string,
) {
  return respond(request, async () => {
    const input = await scope(serviceSlug, bunshinId);
    const { strategies } = await repositories();
    return (
      await new ListSocialAccountStrategies(strategies).execute({
        ...input,
        socialProfileId: resourceId(socialProfileId),
      })
    ).map(dto);
  });
}

export function approveServiceAccountStrategyResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  strategyId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (!emptySchema.safeParse(await body(request)).success)
      throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const input = await scope(serviceSlug, bunshinId);
    const { assignments, strategies } = await repositories();
    return dto(
      await new ApproveSocialAccountStrategy(strategies, assignments).execute({
        ...input,
        strategyId: resourceId(strategyId),
      }),
    );
  });
}

export function generateServiceAccountStrategyResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = generateSchema.safeParse(await body(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const input = await scope(serviceSlug, bunshinId);
      const logger = createLogger().child({
        requestId,
        workspaceId: input.workspaceId,
        bunshinId,
        route: '/service-account-strategies/generate',
      });
      const started = Date.now();
      const { apiKey, model } = await resolveOpenAiRuntimeConfiguration();
      const { assignments, bunshins, profiles, strategies } = await repositories();
      const bunshin = await new GetBunshin(bunshins).execute(input);
      const profile = await profiles.findByPlatform({
        ...input,
        platform: parsed.data.platform,
      });
      if (!profile || profile.id !== parsed.data.socialProfileId)
        throw new ApplicationError('NOT_FOUND', 'social profile not found');
      const { OpenAIStrategyGenerator } = await import('../providers/openai-strategy-generator');
      try {
        const result = await new GenerateSocialAccountStrategy(
          new OpenAIStrategyGenerator({ apiKey, model }),
        ).execute({
          wizardTopic: parsed.data.wizardTopic,
          wizardAudience: parsed.data.wizardAudience,
          platform: parsed.data.platform,
          goal: parsed.data.goal,
          availableMinutes: parsed.data.availableMinutes,
          destinationType: parsed.data.destinationType,
          destinationDetail: parsed.data.destinationDetail ?? null,
          bunshin: {
            name: bunshin.name,
            objectiveSummary: bunshin.objectiveSummary,
            audienceSummary: bunshin.audienceSummary,
            personalitySummary: bunshin.personalitySummary,
            objectives: bunshin.objectives,
            audiences: bunshin.audiences,
            personality: bunshin.personality,
          },
          grantedKnowledge: [],
        });
        logger.info('service strategy generation complete', {
          status: 'success',
          model: result.model,
          promptVersion: result.promptVersion,
          latency: result.latencyMs,
        });
        await recordAiUsageSafely({
          workspaceId: input.workspaceId,
          bunshinId,
          actorUserId: input.actorUserId,
          taskType: 'STRATEGY_GENERATOR',
          provider: 'openai',
          model: result.model,
          promptVersion: result.promptVersion,
          status: 'SUCCESS',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          idempotencyKey: `${requestId}:service-strategy`,
        });
        return dto(
          await new CreateSocialAccountStrategy(strategies, assignments).execute({
            ...input,
            socialProfileId: parsed.data.socialProfileId,
            platform: parsed.data.platform,
            goal: parsed.data.goal,
            availableMinutes: parsed.data.availableMinutes,
            destinationType: parsed.data.destinationType,
            ...(parsed.data.destinationDetail === undefined
              ? {}
              : { destinationDetail: parsed.data.destinationDetail }),
            ...result.output,
            status: 'PROPOSED',
          }),
        );
      } catch (error) {
        logger.error('service strategy generation failed', {
          status: 'failed',
          model,
          latency: Date.now() - started,
          errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
        });
        throw error;
      }
    },
    201,
    requestId,
  );
}
