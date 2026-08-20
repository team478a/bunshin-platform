import 'server-only';
import {
  GetMissionFeedback,
  GetPostRecord,
  MISSION_FEEDBACK_RATINGS,
  RecordManualPost,
  RecordMissionFeedback,
  SOCIAL_PLATFORMS,
  type MissionActivity,
  type MissionFeedback,
  type PostRecord,
} from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuidSchema = z.string().uuid();
const keySchema = z.string().trim().min(1).max(200);
const postSchema = z
  .object({
    platform: z.enum(SOCIAL_PLATFORMS),
    postUrl: z.string().max(2048).nullable().optional(),
    idempotencyKey: keySchema,
  })
  .strict();
const feedbackSchema = z
  .object({ rating: z.enum(MISSION_FEEDBACK_RATINGS), idempotencyKey: keySchema })
  .strict();

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
function resourceId(value: string) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid mission id');
  return parsed.data;
}
async function scope(workspaceId: string, bunshinId: string) {
  return { workspaceId, bunshinId, actorUserId: await actorUserId() };
}
async function repositories() {
  const db = await import('@bunshin/database');
  return {
    missions: new db.PrismaDailyMissionRepository(),
    assignments: new db.PrismaBunshinCapabilityAssignmentRepository(),
    outcomes: new db.PrismaMissionOutcomeRepository(),
  };
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
export const postRecordDto = (value: PostRecord) => ({
  ...value,
  postedAt: value.postedAt.toISOString(),
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});
export const missionFeedbackDto = (value: MissionFeedback) => ({
  ...value,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});
const activityDto = (value: MissionActivity) => ({
  ...value,
  occurredAt: value.occurredAt.toISOString(),
  createdAt: value.createdAt.toISOString(),
});

export function getPostRecordResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    const { outcomes } = await repositories();
    return postRecordDto(
      await new GetPostRecord(outcomes).execute({
        ...(await scope(workspaceId, bunshinId)),
        dailyMissionId: resourceId(dailyMissionId),
      }),
    );
  });
}
export function recordPostResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = postSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { missions, assignments, outcomes } = await repositories();
    const result = await new RecordManualPost(missions, assignments, outcomes).execute({
      ...(await scope(workspaceId, bunshinId)),
      dailyMissionId: resourceId(dailyMissionId),
      ...parsed.data,
      postUrl: parsed.data.postUrl ?? null,
    });
    return { post: postRecordDto(result.post), activity: activityDto(result.activity) };
  });
}
export function getMissionFeedbackResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    const { outcomes } = await repositories();
    return missionFeedbackDto(
      await new GetMissionFeedback(outcomes).execute({
        ...(await scope(workspaceId, bunshinId)),
        dailyMissionId: resourceId(dailyMissionId),
      }),
    );
  });
}
export function recordMissionFeedbackResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = feedbackSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { missions, assignments, outcomes } = await repositories();
    const result = await new RecordMissionFeedback(missions, assignments, outcomes).execute({
      ...(await scope(workspaceId, bunshinId)),
      dailyMissionId: resourceId(dailyMissionId),
      ...parsed.data,
    });
    return {
      feedback: missionFeedbackDto(result.feedback),
      activity: activityDto(result.activity),
    };
  });
}
