import 'server-only';
import {
  MISSION_FEEDBACK_RATINGS,
  MISSION_REJECTION_REASONS,
  SOCIAL_PLATFORMS,
} from '@bunshin/capability-social';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { BUSINESS_OUTCOME_KEYS } from '../services/business-outcomes';
import { resolvePublicServiceContext } from '../services/public-service';
import { dailyMissionGenerationError } from './daily-mission-generation-error';

export const uuidSchema = z.string().uuid();
export const generateSchema = z
  .object({
    missionDate: z.string(),
    timezone: z.string(),
    socialProfileId: uuidSchema,
    idempotencyKey: uuidSchema,
  })
  .strict();
export const keySchema = z.string().trim().min(1).max(200);
export const decisionSchema = z.discriminatedUnion('decision', [
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
export const activitySchema = z.discriminatedUnion('type', [
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
export const postSchema = z
  .object({ platform: z.enum(SOCIAL_PLATFORMS), idempotencyKey: keySchema })
  .strict();
export const feedbackSchema = z
  .object({ rating: z.enum(MISSION_FEEDBACK_RATINGS), idempotencyKey: keySchema })
  .strict();
export const businessOutcomeSchema = z
  .object(
    Object.fromEntries(
      BUSINESS_OUTCOME_KEYS.map((key) => [key, z.number().int().min(0).max(999)]),
    ) as Record<(typeof BUSINESS_OUTCOME_KEYS)[number], z.ZodNumber>,
  )
  .strict();
export const variantGenerationSchema = z
  .object({
    idempotencyKey: uuidSchema,
    acceptedPointCost: z.number().int().positive(),
    instruction: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export const variantSelectionSchema = z.object({ idempotencyKey: uuidSchema }).strict();
export const emptySchema = z.object({}).strict();

async function actorUserId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

export async function body(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return await request.json();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

export async function serviceDailyMissionScope(serviceSlug: string, bunshinId: string) {
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

export async function respond(
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
