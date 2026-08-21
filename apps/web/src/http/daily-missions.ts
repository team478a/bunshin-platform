import 'server-only';
import {
  CreateDailyMission,
  CheckMissionQuality,
  GenerateDailyMissionBrief,
  GenerateMissionContent,
  GetDailyMission,
  ListContentPillars,
  ListDailyMissions,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListWeeklyPlans,
  SOCIAL_PREFERRED_FORMATS,
  TransitionDailyMission,
  type DailyMission,
  type DailyMissionStatus,
} from '@bunshin/capability-social';
import {
  GetBunshin,
  ListGrantedKnowledgeForBunshin,
  RequireActiveBunshinCapability,
} from '@bunshin/application';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuidSchema = z.string().uuid();
const createSchema = z
  .object({
    socialProfileId: uuidSchema.nullable().optional(),
    weeklyPlanItemId: uuidSchema.nullable().optional(),
    missionDate: z.string(),
    format: z.enum(SOCIAL_PREFERRED_FORMATS),
    estimatedMinutes: z.number().int(),
    topic: z.string(),
    angle: z.string(),
    reason: z.string(),
    content: z.record(z.string(), z.unknown()),
    qualityScore: z.number().int().nullable().optional(),
  })
  .strict();
const emptySchema = z.object({}).strict();
const generateSchema = z
  .object({
    missionDate: z.string(),
    timezone: z.string(),
    socialProfileId: uuidSchema,
    idempotencyKey: uuidSchema,
  })
  .strict();
const transitionStatus = {
  viewed: 'VIEWED',
  started: 'STARTED',
  completed: 'COMPLETED',
  skipped: 'SKIPPED',
  expired: 'EXPIRED',
} as const satisfies Record<string, DailyMissionStatus>;
export type DailyMissionAction = keyof typeof transitionStatus;

async function actorUserId() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}

async function jsonBody(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
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
    missions: new db.PrismaDailyMissionRepository(),
    assignments: new db.PrismaBunshinCapabilityAssignmentRepository(),
  };
}

function resourceId(value: string) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid mission id');
  return parsed.data;
}

function generationErrorCategory(error: unknown) {
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

export const dailyMissionDto = (value: DailyMission) => ({
  ...value,
  viewedAt: value.viewedAt?.toISOString() ?? null,
  startedAt: value.startedAt?.toISOString() ?? null,
  completedAt: value.completedAt?.toISOString() ?? null,
  skippedAt: value.skippedAt?.toISOString() ?? null,
  expiredAt: value.expiredAt?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});

async function respond(
  request: Request,
  operation: () => Promise<unknown>,
  status = 200,
  existingRequestId?: string,
) {
  const requestId = existingRequestId ?? requestIdFromHeader(request.headers.get('x-request-id'));
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

export function generateDailyMissionResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const logger = createLogger().child({
    requestId,
    workspaceId,
    bunshinId,
    route: '/daily-missions/generate',
  });
  const started = Date.now();
  return respond(
    request,
    async () => {
      let generationId: string | null = null;
      let generationScope: { workspaceId: string; bunshinId: string; actorUserId: string } | null =
        null;
      try {
        requireSameOrigin(request);
        const parsed = generateSchema.safeParse(await jsonBody(request));
        if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
        const actor = await actorUserId();
        const db = await import('@bunshin/database');
        const scoped = { workspaceId, bunshinId, actorUserId: actor };
        generationScope = scoped;
        const assignments = new db.PrismaBunshinCapabilityAssignmentRepository();
        const missions = new db.PrismaDailyMissionRepository();
        await new RequireActiveBunshinCapability(assignments).execute({
          ...scoped,
          capabilityType: 'SOCIAL',
        });
        const existing = await new ListDailyMissions(missions).execute({
          ...scoped,
          from: parsed.data.missionDate,
          to: parsed.data.missionDate,
        });
        if (existing.some(({ missionDate }) => missionDate === parsed.data.missionDate))
          throw new ApplicationError('CONFLICT', 'daily mission already exists');

        const profiles = await new ListSocialProfiles(
          new db.PrismaSocialProfileRepository(),
        ).execute(scoped);
        const profile = profiles.find(
          ({ id, status }) => id === parsed.data.socialProfileId && status === 'ACTIVE',
        );
        if (!profile) throw new ApplicationError('NOT_FOUND', 'active social profile not found');
        const strategies = await new ListSocialAccountStrategies(
          new db.PrismaSocialAccountStrategyRepository(),
        ).execute({ ...scoped, socialProfileId: profile.id });
        const strategy = strategies.find(({ status }) => status === 'APPROVED');
        if (!strategy) throw new ApplicationError('CONFLICT', 'approved strategy is required');
        const weeklyPlans = await new ListWeeklyPlans(new db.PrismaWeeklyPlanRepository()).execute(
          scoped,
        );
        const weeklyPlan = weeklyPlans.find(
          ({ status, items }) =>
            status === 'CONFIRMED' &&
            items.some(({ scheduledDate }) => scheduledDate === parsed.data.missionDate),
        );
        if (!weeklyPlan)
          throw new ApplicationError('NOT_FOUND', 'confirmed weekly plan item not found for date');
        const pillars = await new ListContentPillars(
          new db.PrismaContentPillarRepository(),
        ).execute(scoped);
        const bunshin = await new GetBunshin(new db.PrismaBunshinRepository()).execute(scoped);
        const granted = await new ListGrantedKnowledgeForBunshin(
          new db.PrismaKnowledgeGrantRepository(),
        ).execute(scoped);
        const generationRepository = new db.PrismaDailyMissionGenerationRepository();
        const claim = await generationRepository.claim({
          ...scoped,
          missionDate: parsed.data.missionDate,
          idempotencyKey: parsed.data.idempotencyKey,
        });
        if (!claim.acquired)
          throw new ApplicationError('CONFLICT', 'daily mission generation is in progress');
        generationId = claim.record.id;
        const apiKey = process.env['OPENAI_API_KEY'];
        if (!apiKey)
          throw new ApplicationError('CONFIGURATION_ERROR', 'OPENAI_API_KEY is required');

        const [plannerModule, generatorModule, checkerModule] = await Promise.all([
          import('../providers/openai-daily-mission-planner'),
          import('../providers/openai-mission-content-generator'),
          import('../providers/openai-mission-quality-checker'),
        ]);
        const bunshinContext = {
          name: bunshin.name,
          objectiveSummary: bunshin.objectiveSummary,
          audienceSummary: bunshin.audienceSummary,
          personalitySummary: bunshin.personalitySummary,
        };
        const strategyContext = {
          concept: strategy.concept,
          positioning: strategy.positioning,
          targetSummary: strategy.targetSummary,
          ctaStrategy: strategy.ctaStrategy,
          postingPolicy: strategy.postingPolicy,
        };
        const knowledge = granted.map(({ type, title, content }) => ({ type, title, content }));
        const brief = await new GenerateDailyMissionBrief(
          new plannerModule.OpenAIDailyMissionPlanner({
            apiKey,
            ...(process.env['OPENAI_DAILY_MISSION_PLANNER_MODEL']
              ? { model: process.env['OPENAI_DAILY_MISSION_PLANNER_MODEL'] }
              : {}),
          }),
        ).execute({
          ...scoped,
          missionDate: parsed.data.missionDate,
          timezone: parsed.data.timezone,
          socialProfile: profile,
          bunshin: bunshinContext,
          approvedStrategy: strategy,
          weeklyPlan,
          contentPillars: pillars,
          grantedKnowledge: knowledge,
        });
        let totalInputTokens = brief.inputTokens ?? 0;
        let totalOutputTokens = brief.outputTokens ?? 0;
        logger.info('daily mission brief generation complete', {
          taskType: 'DAILY_MISSION_PLANNER',
          status: 'success',
          provider: 'openai',
          model: brief.model,
          promptVersion: brief.promptVersion,
          inputTokens: brief.inputTokens,
          outputTokens: brief.outputTokens,
          latency: brief.latencyMs,
        });
        const pillarId = weeklyPlan.items.find(
          ({ id }) => id === brief.output.weeklyPlanItemId,
        )?.contentPillarId;
        const pillar = pillars.find(({ id }) => id === pillarId);
        if (!pillar) throw new ApplicationError('NOT_FOUND', 'active content pillar not found');
        const contentModel =
          process.env['OPENAI_CONTENT_GENERATOR_MODEL'] ??
          process.env['OPENAI_MISSION_CONTENT_MODEL'];
        const contentGenerator = new GenerateMissionContent(
          new generatorModule.OpenAIMissionContentGenerator({
            apiKey,
            ...(contentModel ? { model: contentModel } : {}),
          }),
        );
        const contentInput = {
          platform: profile.platform,
          brief: brief.output,
          bunshin: bunshinContext,
          approvedStrategy: strategyContext,
          contentPillar: { title: pillar.title, description: pillar.description },
          grantedKnowledge: knowledge,
        };
        let content = await contentGenerator.execute(contentInput);
        totalInputTokens += content.inputTokens ?? 0;
        totalOutputTokens += content.outputTokens ?? 0;
        logger.info('mission content generation complete', {
          taskType: 'CONTENT_GENERATOR',
          status: 'success',
          provider: 'openai',
          model: content.model,
          promptVersion: content.promptVersion,
          inputTokens: content.inputTokens,
          outputTokens: content.outputTokens,
          latency: content.latencyMs,
        });
        const qualityChecker = new CheckMissionQuality(
          new checkerModule.OpenAIMissionQualityChecker({
            apiKey,
            ...(process.env['OPENAI_MISSION_QUALITY_MODEL']
              ? { model: process.env['OPENAI_MISSION_QUALITY_MODEL'] }
              : {}),
          }),
        );
        const qualityInput = () => ({
          platform: profile.platform,
          brief: brief.output,
          content: content.output,
          bunshin: bunshinContext,
          approvedStrategy: strategyContext,
        });
        let quality = await qualityChecker.execute(qualityInput());
        totalInputTokens += quality.inputTokens ?? 0;
        totalOutputTokens += quality.outputTokens ?? 0;
        logger.info('mission quality check complete', {
          taskType: 'QUALITY_CHECKER',
          status: 'success',
          provider: 'openai',
          model: quality.model,
          promptVersion: quality.promptVersion,
          inputTokens: quality.inputTokens,
          outputTokens: quality.outputTokens,
          latency: quality.latencyMs,
          verdict: quality.output.verdict,
          qualityScore: quality.output.score,
          retryCount: 0,
        });
        let repairCount = 0;
        if (quality.output.verdict === 'REVISE') {
          repairCount = 1;
          content = await contentGenerator.execute({
            ...contentInput,
            repairInstructions: quality.output.issues.map(
              ({ repairInstruction }) => repairInstruction,
            ),
          });
          totalInputTokens += content.inputTokens ?? 0;
          totalOutputTokens += content.outputTokens ?? 0;
          logger.info('mission content repair complete', {
            taskType: 'CONTENT_REPAIR',
            status: 'success',
            provider: 'openai',
            model: content.model,
            promptVersion: content.promptVersion,
            inputTokens: content.inputTokens,
            outputTokens: content.outputTokens,
            latency: content.latencyMs,
            retryCount: 1,
          });
          quality = await qualityChecker.execute(qualityInput());
          totalInputTokens += quality.inputTokens ?? 0;
          totalOutputTokens += quality.outputTokens ?? 0;
          logger.info('mission repair quality check complete', {
            taskType: 'QUALITY_CHECKER',
            status: 'success',
            provider: 'openai',
            model: quality.model,
            promptVersion: quality.promptVersion,
            inputTokens: quality.inputTokens,
            outputTokens: quality.outputTokens,
            latency: quality.latencyMs,
            verdict: quality.output.verdict,
            qualityScore: quality.output.score,
            retryCount: 1,
          });
        }
        if (quality.output.verdict !== 'PASS')
          throw new ApplicationError('CONTENT_REJECTED', 'generated mission failed quality check');
        const created = await new CreateDailyMission(missions, assignments).execute({
          ...scoped,
          ...brief.output,
          content: content.output,
          qualityScore: quality.output.score,
        });
        logger.info('daily mission intelligence pipeline complete', {
          status: 'success',
          totalInputTokens,
          totalOutputTokens,
          retryCount: repairCount,
          latency: Date.now() - started,
        });
        try {
          await generationRepository.complete({
            ...scoped,
            id: generationId,
            dailyMissionId: created.id,
          });
        } catch {
          logger.error('daily mission generation observation update failed', {
            status: 'failed',
            errorCode: 'OBSERVATION_UPDATE_FAILED',
          });
        }
        return dailyMissionDto(created);
      } catch (error) {
        if (generationId && generationScope) {
          try {
            const db = await import('@bunshin/database');
            await new db.PrismaDailyMissionGenerationRepository().fail({
              ...generationScope,
              id: generationId,
              errorCategory: generationErrorCategory(error),
            });
          } catch {
            logger.error('daily mission generation failure state update failed', {
              status: 'failed',
              errorCode: 'OBSERVATION_UPDATE_FAILED',
            });
          }
        }
        logger.error('daily mission intelligence pipeline failed', {
          status: 'failed',
          latency: Date.now() - started,
          errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
          errorCategory: generationErrorCategory(error),
        });
        throw error;
      }
    },
    201,
    requestId,
  );
}

async function scope(workspaceId: string, bunshinId: string) {
  return { workspaceId, bunshinId, actorUserId: await actorUserId() };
}

export function listDailyMissionsResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const { missions } = await repositories();
    return (
      await new ListDailyMissions(missions).execute({
        ...(await scope(workspaceId, bunshinId)),
        ...(from === null ? {} : { from }),
        ...(to === null ? {} : { to }),
      })
    ).map(dailyMissionDto);
  });
}

export function createDailyMissionResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const { missions, assignments } = await repositories();
      const { socialProfileId, weeklyPlanItemId, qualityScore, ...values } = parsed.data;
      return dailyMissionDto(
        await new CreateDailyMission(missions, assignments).execute({
          ...(await scope(workspaceId, bunshinId)),
          ...values,
          ...(socialProfileId === undefined ? {} : { socialProfileId }),
          ...(weeklyPlanItemId === undefined ? {} : { weeklyPlanItemId }),
          ...(qualityScore === undefined ? {} : { qualityScore }),
        }),
      );
    },
    201,
  );
}

export function getDailyMissionResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    const { missions } = await repositories();
    return dailyMissionDto(
      await new GetDailyMission(missions).execute({
        ...(await scope(workspaceId, bunshinId)),
        dailyMissionId: resourceId(dailyMissionId),
      }),
    );
  });
}

export function transitionDailyMissionResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyMissionId: string,
  action: DailyMissionAction,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (!emptySchema.safeParse(await jsonBody(request)).success)
      throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const { missions, assignments } = await repositories();
    return dailyMissionDto(
      await new TransitionDailyMission(missions, assignments).execute({
        ...(await scope(workspaceId, bunshinId)),
        dailyMissionId: resourceId(dailyMissionId),
        status: transitionStatus[action],
      }),
    );
  });
}
