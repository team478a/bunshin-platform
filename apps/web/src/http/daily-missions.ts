import 'server-only';
import {
  AuthorizeDailyMissionCopy,
  CreateDailyMission,
  GetDailyMission,
  ListDailyMissions,
  SOCIAL_PREFERRED_FORMATS,
  TransitionDailyMission,
  type DailyMission,
  type DailyMissionStatus,
} from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
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
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = generateSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const actor = await actorUserId();
      const { createDailyMissionGenerationService } =
        await import('../services/daily-mission-generation');
      return dailyMissionDto(
        await createDailyMissionGenerationService().execute({
          workspaceId,
          bunshinId,
          actorUserId: actor,
          missionDate: parsed.data.missionDate,
          timezone: parsed.data.timezone,
          socialProfileId: parsed.data.socialProfileId,
          generationIdempotencyKey: parsed.data.idempotencyKey,
          usageIdempotencyPrefix: requestId,
          existingPolicy: 'CONFLICT',
        }),
      );
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

export function authorizeDailyMissionCopyResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (!emptySchema.safeParse(await jsonBody(request)).success)
      throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const { missions } = await repositories();
    return new AuthorizeDailyMissionCopy(missions).execute({
      ...(await scope(workspaceId, bunshinId)),
      dailyMissionId: resourceId(dailyMissionId),
    });
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
