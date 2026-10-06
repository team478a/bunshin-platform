import 'server-only';

import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';
import { requirePersonalLearningPilotForReservedProgram } from '../services/personal-learning-pilot-access';
import { enqueueAiTrainingEvaluation } from '../services/ai-training-evaluation-queue';

const uuid = z.string().uuid();
const bodySchema = z.object({ idempotencyKey: uuid }).strict();

const response = (data: unknown, requestId: string) =>
  Response.json({ data, requestId }, { headers: { 'cache-control': 'private, no-store' } });

const failure = (error: unknown, requestId: string) => {
  const mapped = toApiError(error, requestId);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
};

async function resolveScopedAnswer(
  serviceSlug: string,
  rawEnrollmentId: string,
  rawAnswerId: string,
) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
  const enrollmentId = uuid.parse(rawEnrollmentId);
  await requirePersonalLearningPilotForReservedProgram(
    serviceSlug,
    enrollmentId,
    actor.userId,
    service,
  );
  const answerId = uuid.parse(rawAnswerId);
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      serviceRole: 'PARTICIPANT',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (!membership) throw new ApplicationError('NOT_FOUND', 'training answer not found');
  const enrollment = await db.prisma.programEnrollment.findFirst({
    where: {
      id: enrollmentId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      groupMembershipId: membership.id,
      status: 'ACTIVE',
      AND: [db.trainingEnrollmentPeriodWhere(new Date())],
    },
    select: { id: true },
  });
  if (!enrollment) throw new ApplicationError('NOT_FOUND', 'training answer not found');
  const answer = await db.prisma.trainingMissionAnswer.findFirst({
    where: {
      id: answerId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      programEnrollmentId: enrollment.id,
      userId: actor.userId,
    },
    select: { id: true, evaluationStatus: true, evaluation: true },
  });
  if (!answer) throw new ApplicationError('NOT_FOUND', 'training answer not found');
  return { actor, service, enrollment, answer };
}

export async function getAiTrainingEvaluationResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
  rawAnswerId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const { answer } = await resolveScopedAnswer(serviceSlug, rawEnrollmentId, rawAnswerId);
    return response(
      {
        status: answer.evaluationStatus,
        ...(answer.evaluationStatus === 'READY' ? { evaluation: answer.evaluation } : {}),
      },
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function evaluateAiTrainingAnswerResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
  rawAnswerId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    }
    const [, scope] = await Promise.all([
      bodySchema.parseAsync(request.json()),
      resolveScopedAnswer(serviceSlug, rawEnrollmentId, rawAnswerId),
    ]);
    if (scope.answer.evaluationStatus === 'READY') {
      return response({ status: 'READY', evaluation: scope.answer.evaluation }, requestId);
    }
    await enqueueAiTrainingEvaluation({
      workspaceId: scope.service.workspaceId,
      groupId: scope.service.serviceId,
      enrollmentId: scope.enrollment.id,
      answerId: scope.answer.id,
      actorUserId: scope.actor.userId,
      correlationId: requestId,
      resetFailed: scope.answer.evaluationStatus === 'FAILED',
    });
    return response({ status: 'PENDING' }, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
