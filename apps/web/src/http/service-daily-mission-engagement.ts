import 'server-only';
import {
  AuthorizeDailyMissionCopy,
  DecideMission,
  RecordMissionActivity,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { requireSameOrigin } from '../auth/request-security';
import { recordCommercialUsageSafely } from '../services/commercial-usage';
import { missionActivityDto, missionDecisionDto } from './mission-engagement';
import {
  activitySchema,
  body,
  decisionSchema,
  emptySchema,
  respond,
  serviceDailyMissionScope,
  uuidSchema,
} from './service-daily-mission-http-core';

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
      ...(await serviceDailyMissionScope(serviceSlug, bunshinId)),
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
    const value = await serviceDailyMissionScope(serviceSlug, bunshinId);
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
    const value = await serviceDailyMissionScope(serviceSlug, bunshinId);
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
