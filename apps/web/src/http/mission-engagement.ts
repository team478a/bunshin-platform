import 'server-only';
import {
  DecideMission,
  GetMissionDecision,
  ListMissionActivities,
  MISSION_REJECTION_REASONS,
  RecordMissionActivity,
  type MissionActivity,
  type MissionDecision,
} from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuidSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(1).max(200);
const decisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('ACCEPTED'), idempotencyKey: idempotencyKeySchema }).strict(),
  z
    .object({
      decision: z.literal('REJECTED'),
      rejectionReason: z.enum(MISSION_REJECTION_REASONS),
      rejectionDetail: z.string().max(1000).nullable().optional(),
      idempotencyKey: idempotencyKeySchema,
    })
    .strict(),
]);
const activitySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('VIEWED'), idempotencyKey: idempotencyKeySchema }).strict(),
  z.object({ type: z.literal('COPIED_TEXT'), idempotencyKey: idempotencyKeySchema }).strict(),
  z
    .object({ type: z.literal('COPIED_IMAGE_INSTRUCTION'), idempotencyKey: idempotencyKeySchema })
    .strict(),
  z
    .object({ type: z.literal('COPIED_VIDEO_PROMPT'), idempotencyKey: idempotencyKeySchema })
    .strict(),
  z.object({ type: z.literal('COPIED_SCRIPT'), idempotencyKey: idempotencyKeySchema }).strict(),
  z
    .object({
      type: z.literal('COPIED_SLIDE'),
      idempotencyKey: idempotencyKeySchema,
      metadata: z
        .object({ slideIndex: z.number().int().min(1).max(7) })
        .strict()
        .nullable()
        .optional(),
    })
    .strict(),
]);

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
    engagement: new db.PrismaMissionEngagementRepository(),
  };
}
function resourceId(value: string) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid mission id');
  return parsed.data;
}
async function scope(workspaceId: string, bunshinId: string) {
  return { workspaceId, bunshinId, actorUserId: await actorUserId() };
}
async function respond(request: Request, operation: () => Promise<unknown>) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
export const missionDecisionDto = (value: MissionDecision) => ({
  ...value,
  decidedAt: value.decidedAt?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});
export const missionActivityDto = (value: MissionActivity) => ({
  ...value,
  occurredAt: value.occurredAt.toISOString(),
  createdAt: value.createdAt.toISOString(),
});

export function getMissionDecisionResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    const { engagement } = await repositories();
    return missionDecisionDto(
      await new GetMissionDecision(engagement).execute({
        ...(await scope(workspaceId, bunshinId)),
        dailyMissionId: resourceId(dailyMissionId),
      }),
    );
  });
}
export function decideMissionResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = decisionSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { missions, assignments, engagement } = await repositories();
    const input = parsed.data;
    const common = {
      ...(await scope(workspaceId, bunshinId)),
      dailyMissionId: resourceId(dailyMissionId),
      idempotencyKey: input.idempotencyKey,
    };
    const result = await new DecideMission(missions, assignments, engagement).execute(
      input.decision === 'ACCEPTED'
        ? { ...common, decision: input.decision }
        : {
            ...common,
            decision: input.decision,
            rejectionReason: input.rejectionReason,
            rejectionDetail: input.rejectionDetail ?? null,
          },
    );
    return {
      decision: missionDecisionDto(result.decision),
      activity: missionActivityDto(result.activity),
    };
  });
}
export function listMissionActivitiesResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    const { engagement } = await repositories();
    return (
      await new ListMissionActivities(engagement).execute({
        ...(await scope(workspaceId, bunshinId)),
        dailyMissionId: resourceId(dailyMissionId),
      })
    ).map(missionActivityDto);
  });
}
export function recordMissionActivityResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = activitySchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { missions, assignments, engagement } = await repositories();
    const input = parsed.data;
    return missionActivityDto(
      await new RecordMissionActivity(missions, assignments, engagement).execute({
        ...(await scope(workspaceId, bunshinId)),
        dailyMissionId: resourceId(dailyMissionId),
        type: input.type,
        idempotencyKey: input.idempotencyKey,
        ...(input.type === 'COPIED_SLIDE' && input.metadata !== undefined
          ? { metadata: input.metadata }
          : {}),
      }),
    );
  });
}
