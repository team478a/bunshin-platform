import 'server-only';
import { ServiceReferralRewardService } from '@bunshin/application';
import {
  AuthorizeDailyMissionCopy,
  DecideMission,
  ListDailyMissions,
  ListMissionContentVariants,
  MISSION_FEEDBACK_RATINGS,
  MISSION_REJECTION_REASONS,
  RecordManualPost,
  RecordMissionActivity,
  RecordMissionFeedback,
  SelectMissionContentVariant,
  SOCIAL_PLATFORMS,
} from '@bunshin/capability-social';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';
import { readServiceOnboardingSettings } from '../services/service-onboarding-settings';
import {
  BUSINESS_OUTCOME_KEYS,
  readBusinessOutcomes,
  writeBusinessOutcomes,
} from '../services/business-outcomes';
import { dailyMissionDto, missionContentVariantDto } from './daily-missions';
import { missionActivityDto, missionDecisionDto } from './mission-engagement';
import { missionFeedbackDto, postRecordDto } from './mission-outcome';
import { dailyMissionGenerationError } from './daily-mission-generation-error';
import { recordCommercialUsageSafely } from '../services/commercial-usage';

const uuidSchema = z.string().uuid();
const generateSchema = z
  .object({
    missionDate: z.string(),
    timezone: z.string(),
    socialProfileId: uuidSchema,
    idempotencyKey: uuidSchema,
  })
  .strict();
const keySchema = z.string().trim().min(1).max(200);
const decisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('ACCEPTED'), idempotencyKey: keySchema }).strict(),
  z
    .object({
      decision: z.literal('REJECTED'),
      rejectionReason: z.enum(MISSION_REJECTION_REASONS),
      rejectionDetail: z.string().max(1000).nullable().optional(),
      idempotencyKey: keySchema,
    })
    .strict(),
]);
const activitySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('VIEWED'), idempotencyKey: keySchema }).strict(),
  z.object({ type: z.literal('EXECUTION_COMPLETED'), idempotencyKey: keySchema }).strict(),
  z.object({ type: z.literal('EXECUTION_PARTIAL'), idempotencyKey: keySchema }).strict(),
  z.object({ type: z.literal('EXECUTION_NOT_COMPLETED'), idempotencyKey: keySchema }).strict(),
  z.object({ type: z.literal('EXECUTION_HELP_NEEDED'), idempotencyKey: keySchema }).strict(),
  z.object({ type: z.literal('COPIED_TEXT'), idempotencyKey: keySchema }).strict(),
  z.object({ type: z.literal('COPIED_IMAGE_INSTRUCTION'), idempotencyKey: keySchema }).strict(),
  z.object({ type: z.literal('COPIED_VIDEO_PROMPT'), idempotencyKey: keySchema }).strict(),
  z.object({ type: z.literal('COPIED_SCRIPT'), idempotencyKey: keySchema }).strict(),
  z
    .object({
      type: z.literal('COPIED_SLIDE'),
      idempotencyKey: keySchema,
      metadata: z
        .object({ slideIndex: z.number().int().min(1).max(7) })
        .strict()
        .optional(),
    })
    .strict(),
]);
const postSchema = z
  .object({ platform: z.enum(SOCIAL_PLATFORMS), idempotencyKey: keySchema })
  .strict();
const feedbackSchema = z
  .object({ rating: z.enum(MISSION_FEEDBACK_RATINGS), idempotencyKey: keySchema })
  .strict();
const businessOutcomeSchema = z
  .object(
    Object.fromEntries(
      BUSINESS_OUTCOME_KEYS.map((key) => [key, z.number().int().min(0).max(999)]),
    ) as Record<(typeof BUSINESS_OUTCOME_KEYS)[number], z.ZodNumber>,
  )
  .strict();
const variantGenerationSchema = z
  .object({
    idempotencyKey: uuidSchema,
    acceptedPointCost: z.number().int().positive(),
    instruction: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
const variantSelectionSchema = z.object({ idempotencyKey: uuidSchema }).strict();
const emptySchema = z.object({}).strict();

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

async function respond(
  request: Request,
  operation: () => Promise<unknown>,
  status = 200,
  suppliedRequestId?: string,
  generation = false,
) {
  const requestId = suppliedRequestId ?? requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { status, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = generation
      ? dailyMissionGenerationError(error, requestId)
      : toApiError(error, requestId);
    if (generation) {
      createLogger().warn('service daily mission generation failed', {
        requestId,
        errorCode: mapped.body.error.code,
        reason: 'reason' in mapped.body.error ? mapped.body.error.reason : 'UNCLASSIFIED',
        status: mapped.status,
      });
    }
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

export function listServiceDailyMissionsResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const db = await import('@bunshin/database');
    return (
      await new ListDailyMissions(new db.PrismaDailyMissionRepository()).execute({
        ...(await scope(serviceSlug, bunshinId)),
        ...(from === null ? {} : { from }),
        ...(to === null ? {} : { to }),
      })
    ).map(dailyMissionDto);
  });
}

export function generateServiceDailyMissionResponse(
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
      const { createDailyMissionGenerationService } =
        await import('../services/daily-mission-generation');
      const value = await scope(serviceSlug, bunshinId);
      const mission = await createDailyMissionGenerationService().execute({
        ...value,
        missionDate: parsed.data.missionDate,
        timezone: parsed.data.timezone,
        socialProfileId: parsed.data.socialProfileId,
        generationIdempotencyKey: parsed.data.idempotencyKey,
        usageIdempotencyPrefix: requestId,
        existingPolicy: 'CONFLICT',
        serviceSafeMode: true,
        allowServiceOwnerMemories: true,
      });
      await recordCommercialUsageSafely({
        workspaceId: value.workspaceId,
        groupId: value.groupId,
        userId: value.actorUserId,
        eventType: 'POST_GENERATE',
        source: 'service_daily_mission',
        idempotencyKey: `POST_GENERATE:${parsed.data.idempotencyKey}`,
        metadata: { dailyMissionId: mission.id },
      });
      return dailyMissionDto(mission);
    },
    201,
    requestId,
    true,
  );
}

export function listServiceMissionContentVariantsResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    const db = await import('@bunshin/database');
    return (
      await new ListMissionContentVariants(new db.PrismaMissionContentVariantRepository()).execute({
        ...(await scope(serviceSlug, bunshinId)),
        dailyMissionId: uuidSchema.parse(dailyMissionId),
      })
    ).map(missionContentVariantDto);
  });
}

export function generateServiceMissionContentVariantResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = variantGenerationSchema.safeParse(await body(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const { generatePointFundedMissionContentVariant } =
        await import('../services/point-funded-mission-content-variant');
      const value = await scope(serviceSlug, bunshinId);
      const variant = await generatePointFundedMissionContentVariant({
        ...value,
        dailyMissionId: uuidSchema.parse(dailyMissionId),
        generationIdempotencyKey: parsed.data.idempotencyKey,
        usageIdempotencyPrefix: requestId,
        acceptedPointCost: parsed.data.acceptedPointCost,
        serviceSafeMode: true,
        allowServiceOwnerMemories: true,
        ...(parsed.data.instruction ? { variantInstructions: [parsed.data.instruction] } : {}),
      });
      await recordCommercialUsageSafely({
        workspaceId: value.workspaceId,
        groupId: value.groupId,
        userId: value.actorUserId,
        eventType: 'POST_REGENERATE',
        source: 'service_mission_variant',
        idempotencyKey: `POST_REGENERATE:${parsed.data.idempotencyKey}`,
        metadata: { dailyMissionId, variantId: variant.id },
      });
      return missionContentVariantDto(variant);
    },
    201,
    requestId,
    true,
  );
}

export function selectServiceMissionContentVariantResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
  variantId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = variantSelectionSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const db = await import('@bunshin/database');
    const value = await scope(serviceSlug, bunshinId);
    const variant = await new SelectMissionContentVariant(
      new db.PrismaMissionContentVariantRepository(),
    ).execute({
      ...value,
      dailyMissionId: uuidSchema.parse(dailyMissionId),
      variantId: uuidSchema.parse(variantId),
      idempotencyKey: parsed.data.idempotencyKey,
      selectedAt: new Date(),
    });
    await recordCommercialUsageSafely({
      workspaceId: value.workspaceId,
      groupId: value.groupId,
      userId: value.actorUserId,
      eventType: 'CONTENT_APPROVE',
      source: 'service_mission_variant',
      idempotencyKey: `CONTENT_APPROVE:${parsed.data.idempotencyKey}`,
      metadata: { dailyMissionId, variantId },
    });
    return missionContentVariantDto(variant);
  });
}

export function authorizeServiceDailyMissionCopyResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (!emptySchema.safeParse(await body(request)).success)
      throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const db = await import('@bunshin/database');
    return new AuthorizeDailyMissionCopy(new db.PrismaDailyMissionRepository()).execute({
      ...(await scope(serviceSlug, bunshinId)),
      dailyMissionId: uuidSchema.parse(dailyMissionId),
    });
  });
}

export function decideServiceDailyMissionResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = decisionSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const db = await import('@bunshin/database');
    const value = await scope(serviceSlug, bunshinId);
    const common = {
      ...value,
      dailyMissionId: uuidSchema.parse(dailyMissionId),
      idempotencyKey: parsed.data.idempotencyKey,
    };
    const result = await new DecideMission(
      new db.PrismaDailyMissionRepository(),
      new db.PrismaBunshinCapabilityAssignmentRepository(),
      new db.PrismaMissionEngagementRepository(),
    ).execute(
      parsed.data.decision === 'ACCEPTED'
        ? { ...common, decision: 'ACCEPTED' }
        : {
            ...common,
            decision: 'REJECTED',
            rejectionReason: parsed.data.rejectionReason,
            rejectionDetail: parsed.data.rejectionDetail ?? null,
          },
    );
    if (parsed.data.decision === 'ACCEPTED') {
      await recordCommercialUsageSafely({
        workspaceId: value.workspaceId,
        groupId: value.groupId,
        userId: value.actorUserId,
        eventType: 'CONTENT_APPROVE',
        source: 'service_mission_decision',
        idempotencyKey: `CONTENT_APPROVE:${parsed.data.idempotencyKey}`,
        metadata: { dailyMissionId },
      });
    }
    return {
      decision: missionDecisionDto(result.decision),
      activity: missionActivityDto(result.activity),
    };
  });
}

export function recordServiceMissionActivityResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = activitySchema.safeParse(await body(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const db = await import('@bunshin/database');
    const value = await scope(serviceSlug, bunshinId);
    const activity = await new RecordMissionActivity(
      new db.PrismaDailyMissionRepository(),
      new db.PrismaBunshinCapabilityAssignmentRepository(),
      new db.PrismaMissionEngagementRepository(),
    ).execute({
      ...value,
      dailyMissionId: uuidSchema.parse(dailyMissionId),
      type: parsed.data.type,
      idempotencyKey: parsed.data.idempotencyKey,
      ...(parsed.data.type === 'COPIED_SLIDE' && parsed.data.metadata
        ? { metadata: parsed.data.metadata }
        : {}),
    });
    if (parsed.data.type === 'VIEWED') {
      await recordCommercialUsageSafely({
        workspaceId: value.workspaceId,
        groupId: value.groupId,
        userId: value.actorUserId,
        eventType: 'DAILY_MISSION_VIEW',
        source: 'service_mission_activity',
        idempotencyKey: `DAILY_MISSION_VIEW:${parsed.data.idempotencyKey}`,
        metadata: { dailyMissionId },
      });
    }
    return missionActivityDto(activity);
  });
}

export function recordServicePostResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = postSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const db = await import('@bunshin/database');
    const value = await scope(serviceSlug, bunshinId);
    const result = await new RecordManualPost(
      new db.PrismaDailyMissionRepository(),
      new db.PrismaBunshinCapabilityAssignmentRepository(),
      new db.PrismaMissionOutcomeRepository(),
    ).execute({
      ...value,
      dailyMissionId: uuidSchema.parse(dailyMissionId),
      ...parsed.data,
    });
    await new ServiceReferralRewardService(
      new db.PrismaServiceReferralRewardRepository(),
    ).completeMilestone({
      workspaceId: value.workspaceId,
      groupId: value.groupId,
      referredUserId: value.actorUserId,
      milestone: 'FIRST_POST_REPORTED',
    });
    return { post: postRecordDto(result.post), activity: missionActivityDto(result.activity) };
  });
}

export function recordServiceMissionFeedbackResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = feedbackSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const db = await import('@bunshin/database');
    const result = await new RecordMissionFeedback(
      new db.PrismaDailyMissionRepository(),
      new db.PrismaBunshinCapabilityAssignmentRepository(),
      new db.PrismaMissionOutcomeRepository(),
    ).execute({
      ...(await scope(serviceSlug, bunshinId)),
      dailyMissionId: uuidSchema.parse(dailyMissionId),
      ...parsed.data,
    });
    return {
      feedback: missionFeedbackDto(result.feedback),
      activity: missionActivityDto(result.activity),
    };
  });
}

export function recordServiceBusinessOutcomeResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = businessOutcomeSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const service = await resolvePublicServiceContext(serviceSlug);
    const onboarding = readServiceOnboardingSettings(
      service.configuration.registration.onboardingConfig,
      service.configuration.registration.surveyConfig,
    );
    if (!onboarding.businessProfileEnabled)
      throw new ApplicationError('FORBIDDEN', 'business outcome reporting is not enabled');
    const value = await scope(serviceSlug, bunshinId);
    const db = await import('@bunshin/database');
    const repository = new db.PrismaMissionOutcomeRepository();
    const post = await repository.getPost({
      ...value,
      dailyMissionId: uuidSchema.parse(dailyMissionId),
    });
    if (!post) throw new ApplicationError('CONFLICT', 'post must be recorded first');
    const outcomes = readBusinessOutcomes({ businessOutcomes: parsed.data });
    await db.prisma.postRecord.update({
      where: { id: post.id },
      data: { manualMetrics: writeBusinessOutcomes(post.manualMetrics, outcomes) },
    });
    return { outcomes };
  });
}
