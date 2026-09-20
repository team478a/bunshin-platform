import 'server-only';
import {
  AiTrainingParticipantService,
  AiTrainingV1Policy,
  TrainingRuntimeError,
} from '@bunshin/capability-training';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';

const uuid = z.string().uuid();
const submissionSchema = z
  .object({
    missionAssignmentId: uuid,
    answer: z.string().trim().min(1).max(10_000),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

const response = (data: unknown, requestId: string) =>
  Response.json({ data, requestId }, { headers: { 'cache-control': 'private, no-store' } });

const mappedError = (error: unknown) => {
  if (!(error instanceof TrainingRuntimeError)) return error;
  return new ApplicationError(error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'CONFLICT', error.message);
};

const failure = (error: unknown, requestId: string) => {
  const mapped = toApiError(mappedError(error), requestId);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
};

export async function getAiTrainingCurrentMissionResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const data = await new AiTrainingParticipantService(
      new db.PrismaAiTrainingRuntimeRepository(db.prisma),
      new AiTrainingV1Policy(),
    ).current({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId: uuid.parse(rawEnrollmentId),
      now: new Date(),
    });
    return response(data, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function submitAiTrainingAnswerResponse(
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
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, value] = await Promise.all([
      resolveMemberServiceContext(serviceSlug, actor.userId),
      submissionSchema.parseAsync(request.json()),
    ]);
    const db = await import('@bunshin/database');
    const result = await new db.PrismaTrainingAnswerRepository(db.prisma).submit({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId: uuid.parse(rawEnrollmentId),
      ...value,
      occurredAt: new Date(),
    });
    if (result.outcome === 'NOT_FOUND') {
      throw new ApplicationError('NOT_FOUND', 'training mission not found');
    }
    if (result.outcome === 'CONFLICT') {
      throw new ApplicationError('CONFLICT', 'training answer has already been submitted');
    }
    return response(result, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
