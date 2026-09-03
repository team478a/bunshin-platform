import 'server-only';
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
import { GetBunshin, ListGrantedKnowledgeForBunshin } from '@bunshin/application';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';

const createSchema = z
  .object({
    socialProfileId: z.string().uuid(),
    platform: z.enum(SOCIAL_PLATFORMS),
    goal: z.enum(SOCIAL_ACCOUNT_STRATEGY_GOALS),
    availableMinutes: z.union([z.literal(3), z.literal(5), z.literal(10), z.literal(20)]),
    destinationType: z.enum(SOCIAL_ACCOUNT_STRATEGY_DESTINATIONS),
    destinationDetail: z.string().nullable().optional(),
    concept: z.string(),
    positioning: z.string(),
    targetSummary: z.string(),
    profileDraft: z.string(),
    ctaStrategy: z.string(),
    postingPolicy: z.string(),
  })
  .strict();
const approveSchema = z.object({}).strict();
const generateSchema = createSchema
  .pick({
    socialProfileId: true,
    platform: true,
    goal: true,
    availableMinutes: true,
    destinationType: true,
    destinationDetail: true,
  })
  .extend({ wizardTopic: z.string().min(1).max(1000), wizardAudience: z.string().min(1).max(1000) })
  .strict();
async function actorUserId() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}
async function repositories() {
  const db = await import('@bunshin/database');
  return {
    strategies: new db.PrismaSocialAccountStrategyRepository(),
    assignments: new db.PrismaBunshinCapabilityAssignmentRepository(),
  };
}
async function generationRepositories() {
  const db = await import('@bunshin/database');
  return {
    ...(await repositories()),
    bunshins: new db.PrismaBunshinRepository(),
    grants: new db.PrismaKnowledgeGrantRepository(),
    profiles: new db.PrismaSocialProfileRepository(),
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
export function listSocialAccountStrategiesResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  socialProfileId: string,
) {
  return respond(request, async () => {
    const { strategies } = await repositories();
    return (
      await new ListSocialAccountStrategies(strategies).execute({
        workspaceId,
        bunshinId,
        socialProfileId,
        actorUserId: await actorUserId(),
      })
    ).map(dto);
  });
}
export function createSocialAccountStrategyResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await body(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const { destinationDetail, ...values } = parsed.data;
      const { strategies, assignments } = await repositories();
      return dto(
        await new CreateSocialAccountStrategy(strategies, assignments).execute({
          ...values,
          ...(destinationDetail === undefined ? {} : { destinationDetail }),
          workspaceId,
          bunshinId,
          actorUserId: await actorUserId(),
          status: 'PROPOSED',
        }),
      );
    },
    201,
  );
}
export function approveSocialAccountStrategyResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  strategyId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (!approveSchema.safeParse(await body(request)).success)
      throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const { strategies, assignments } = await repositories();
    return dto(
      await new ApproveSocialAccountStrategy(strategies, assignments).execute({
        workspaceId,
        bunshinId,
        strategyId,
        actorUserId: await actorUserId(),
      }),
    );
  });
}

export function generateSocialAccountStrategyResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const logger = createLogger().child({
    requestId,
    workspaceId,
    bunshinId,
    route: '/social-account-strategies/generate',
  });
  const started = Date.now();
  return respond(
    request,
    async () => {
      let usageActor: string | null = null;
      let providerAttempted = false;
      let runtimeModel = process.env['OPENAI_MODEL'] ?? 'gpt-5.2';
      try {
        requireSameOrigin(request);
        const parsed = generateSchema.safeParse(await body(request));
        if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
        const { apiKey, model } = await resolveOpenAiRuntimeConfiguration();
        runtimeModel = model;
        const actor = await actorUserId();
        usageActor = actor;
        const { bunshins, grants, profiles, strategies, assignments } =
          await generationRepositories();
        const bunshin = await new GetBunshin(bunshins).execute({
          workspaceId,
          bunshinId,
          actorUserId: actor,
        });
        const profile = await profiles.findByPlatform({
          workspaceId,
          bunshinId,
          actorUserId: actor,
          platform: parsed.data.platform,
        });
        if (profile === null || profile.id !== parsed.data.socialProfileId)
          throw new ApplicationError('NOT_FOUND', 'social profile not found');
        const granted = await new ListGrantedKnowledgeForBunshin(grants).execute({
          workspaceId,
          bunshinId,
          actorUserId: actor,
        });
        const { OpenAIStrategyGenerator } = await import('../providers/openai-strategy-generator');
        providerAttempted = true;
        const result = await withOrganizationAiGenerationQuota({
          workspaceId,
          operationKey: `${requestId}:strategy`,
          generate: () =>
            new GenerateSocialAccountStrategy(
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
              grantedKnowledge: granted.map(({ type, title, content }) => ({
                type,
                title,
                content,
              })),
            }),
        });
        logger.info('strategy generation complete', {
          status: 'success',
          model: result.model,
          promptVersion: result.promptVersion,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latency: result.latencyMs,
        });
        await recordAiUsageSafely({
          workspaceId,
          bunshinId,
          actorUserId: actor,
          taskType: 'STRATEGY_GENERATOR',
          provider: 'openai',
          model: result.model,
          promptVersion: result.promptVersion,
          status: 'SUCCESS',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          idempotencyKey: `${requestId}:strategy`,
        });
        const {
          destinationDetail,
          wizardTopic: _wizardTopic,
          wizardAudience: _wizardAudience,
          ...values
        } = parsed.data;
        void _wizardTopic;
        void _wizardAudience;
        return dto(
          await new CreateSocialAccountStrategy(strategies, assignments).execute({
            ...values,
            ...result.output,
            ...(destinationDetail === undefined ? {} : { destinationDetail }),
            workspaceId,
            bunshinId,
            actorUserId: actor,
            status: 'PROPOSED',
          }),
        );
      } catch (error) {
        const { SOCIAL_ACCOUNT_STRATEGY_PROMPT_VERSION } =
          await import('../providers/openai-strategy-generator');
        logger.error('strategy generation failed', {
          status: 'failed',
          model: runtimeModel,
          promptVersion: SOCIAL_ACCOUNT_STRATEGY_PROMPT_VERSION,
          latency: Date.now() - started,
          errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
        });
        if (usageActor && providerAttempted)
          await recordAiUsageSafely({
            workspaceId,
            bunshinId,
            actorUserId: usageActor,
            taskType: 'STRATEGY_GENERATOR',
            provider: 'openai',
            model: runtimeModel,
            promptVersion: SOCIAL_ACCOUNT_STRATEGY_PROMPT_VERSION,
            status: 'FAILED',
            inputTokens: null,
            outputTokens: null,
            latencyMs: Date.now() - started,
            errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
            idempotencyKey: `${requestId}:strategy`,
          });
        throw error;
      }
    },
    201,
    requestId,
  );
}
