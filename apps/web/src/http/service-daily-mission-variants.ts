import 'server-only';
import {
  ListMissionContentVariants,
  SelectMissionContentVariant,
} from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import { requireSameOrigin } from '../auth/request-security';
import { recordCommercialUsageSafely } from '../services/commercial-usage';
import { missionContentVariantDto } from './daily-missions';
import {
  body,
  respond,
  serviceDailyMissionScope,
  uuidSchema,
  variantGenerationSchema,
  variantSelectionSchema,
} from './service-daily-mission-http-core';

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
        ...(await serviceDailyMissionScope(serviceSlug, bunshinId)),
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
      const value = await serviceDailyMissionScope(serviceSlug, bunshinId);
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
    const value = await serviceDailyMissionScope(serviceSlug, bunshinId);
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
