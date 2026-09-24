import 'server-only';
import { ListDailyMissions } from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import { requireSameOrigin } from '../auth/request-security';
import { recordCommercialUsageSafely } from '../services/commercial-usage';
import { dailyMissionDto } from './daily-missions';
import {
  body,
  generateSchema,
  respond,
  serviceDailyMissionScope,
} from './service-daily-mission-http-core';

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
        ...(await serviceDailyMissionScope(serviceSlug, bunshinId)),
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
      const value = await serviceDailyMissionScope(serviceSlug, bunshinId);
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
