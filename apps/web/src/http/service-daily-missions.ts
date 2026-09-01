import 'server-only';
import { ServiceReferralRewardService } from '@bunshin/application';
import {
  DecideMission,
  ListDailyMissions,
  MISSION_FEEDBACK_RATINGS,
  MISSION_REJECTION_REASONS,
  RecordManualPost,
  RecordMissionActivity,
  RecordMissionFeedback,
  SOCIAL_PLATFORMS,
} from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';
import { dailyMissionDto } from './daily-missions';
import { missionActivityDto, missionDecisionDto } from './mission-engagement';
import { missionFeedbackDto, postRecordDto } from './mission-outcome';

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
      return dailyMissionDto(
        await createDailyMissionGenerationService().execute({
          ...(await scope(serviceSlug, bunshinId)),
          missionDate: parsed.data.missionDate,
          timezone: parsed.data.timezone,
          socialProfileId: parsed.data.socialProfileId,
          generationIdempotencyKey: parsed.data.idempotencyKey,
          usageIdempotencyPrefix: requestId,
          existingPolicy: 'CONFLICT',
          serviceSafeMode: true,
        }),
      );
    },
    201,
    requestId,
  );
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
    const common = {
      ...(await scope(serviceSlug, bunshinId)),
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
    return missionActivityDto(
      await new RecordMissionActivity(
        new db.PrismaDailyMissionRepository(),
        new db.PrismaBunshinCapabilityAssignmentRepository(),
        new db.PrismaMissionEngagementRepository(),
      ).execute({
        ...(await scope(serviceSlug, bunshinId)),
        dailyMissionId: uuidSchema.parse(dailyMissionId),
        type: parsed.data.type,
        idempotencyKey: parsed.data.idempotencyKey,
        ...(parsed.data.type === 'COPIED_SLIDE' && parsed.data.metadata
          ? { metadata: parsed.data.metadata }
          : {}),
      }),
    );
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
