import 'server-only';
import { ListDailyMissions } from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';
import { dailyMissionDto } from './daily-missions';

const uuidSchema = z.string().uuid();
const generateSchema = z
  .object({
    missionDate: z.string(),
    timezone: z.string(),
    socialProfileId: uuidSchema,
    idempotencyKey: uuidSchema,
  })
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
