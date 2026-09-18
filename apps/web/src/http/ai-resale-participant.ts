import 'server-only';
import {
  AiResaleParticipantService,
  AiResaleV1Policy,
  ResalePersistenceError,
} from '@bunshin/capability-resale';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';

const uuid = z.string().uuid();
const resultSchema = z
  .object({
    assignmentId: uuid,
    resultStatus: z.enum(['DONE', 'PARTIAL', 'NOT_DONE']),
    idempotencyKey: uuid,
    itemTitle: z.string().trim().max(160).nullable().default(null),
    reactionState: z.enum(['NO_REACTION', 'REACTION', 'SOLD']).nullable().default(null),
    improvementType: z.string().trim().max(80).nullable().default(null),
    soldPriceYen: z.number().int().min(0).max(100_000_000).nullable().default(null),
    note: z.string().trim().max(500).nullable().default(null),
  })
  .strict();

async function context(serviceSlug: string, rawEnrollmentId: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
  return {
    actor,
    service,
    programEnrollmentId: uuid.parse(rawEnrollmentId),
  };
}

async function participantService() {
  const db = await import('@bunshin/database');
  return new AiResaleParticipantService(
    new db.PrismaAiResaleParticipantRepository(db.prisma),
    new db.PrismaAiResaleRuntimeRepository(db.prisma),
    new AiResaleV1Policy(),
  );
}

function mapError(error: unknown) {
  if (!(error instanceof ResalePersistenceError)) return error;
  return new ApplicationError(error.code, error.message);
}

const response = (data: unknown, requestId: string) =>
  Response.json({ data, requestId }, { headers: { 'cache-control': 'private, no-store' } });

const failure = (error: unknown, requestId: string) => {
  const mapped = toApiError(mapError(error), requestId);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
};

export async function getAiResaleCurrentActionResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const { actor, service, programEnrollmentId } = await context(serviceSlug, rawEnrollmentId);
    const data = await (
      await participantService()
    ).current({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId,
      now: new Date(),
    });
    return response(data, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function submitAiResaleActionResultResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    }
    const [{ actor, service, programEnrollmentId }, value] = await Promise.all([
      context(serviceSlug, rawEnrollmentId),
      resultSchema.parseAsync(request.json()),
    ]);
    const data = await (
      await participantService()
    ).submit({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId,
      ...value,
      occurredAt: new Date(),
    });
    return response(data, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
