import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
import { boundedLearningJson } from './personal-learning-request';
import { enqueueAiTrainingEvaluation } from '../services/ai-training-evaluation-queue';
import { prepareLearningLesson } from '../services/personal-learning-lesson-candidate';

const body = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('START'),
      requestId: z.string().uuid(),
      requestRevision: z.number().int().positive(),
      candidateId: z.string().uuid(),
      previousAssignmentId: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('NOTE'),
      assignmentId: z.string().uuid(),
      operationId: z.string().uuid(),
      expectedRevision: z.number().int().min(0).max(999),
      text: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal('NEXT_PROPOSAL'),
      assignmentId: z.string().uuid(),
      operationId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('NEXT_CONFIRM'),
      requestId: z.string().uuid(),
      requestRevision: z.number().int().positive(),
      candidateId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('EVIDENCE'),
      assignmentId: z.string().uuid(),
      idempotencyKey: z.string().uuid(),
      candidateId: z.string().uuid(),
      materialVersion: z.literal(1),
      expectedRevision: z.number().int().min(0).max(99),
      kind: z.enum(['TEXT', 'SELF_REPORT']),
      content: z.string().trim().min(1).max(10_000),
    })
    .strict(),
]);
export async function learningPracticeResponse(
  request: Request,
  slug: string,
  enrollmentId: string,
) {
  const headers = { 'cache-control': 'private, no-store' };
  try {
    if (!['GET', 'POST'].includes(request.method))
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers });
    if (request.method === 'POST') {
      requireSameOrigin(request);
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    }
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const actor = await resolvePersonalLearningRequestActor(
      slug,
      enrollmentId,
      user.userId,
      undefined,
      new URL(request.url).searchParams.get('topicId'),
    );
    const db = await import('@bunshin/database');
    const repo = new db.PrismaPersonalLearningPracticeRepository(db.prisma);
    if (request.method === 'GET')
      return Response.json({ data: await repo.readPractice(actor) }, { headers });
    const input = body.parse(await boundedLearningJson(request));
    if (input.action === 'NEXT_PROPOSAL') {
      const nextRequest = await repo.createNextPracticeRequest({
        actor,
        assignmentId: input.assignmentId,
        operationId: input.operationId,
      });
      await prepareLearningLesson(actor, nextRequest.id, nextRequest.revision, input.operationId);
      return Response.json({ data: await repo.readPractice(actor) }, { headers });
    }
    if (input.action === 'NEXT_CONFIRM') {
      await new db.PrismaLearningCandidateRepository(db.prisma).confirm({
        actor,
        requestId: input.requestId,
        requestRevision: input.requestRevision,
        candidateId: input.candidateId,
      });
      return Response.json({ data: await repo.readPractice(actor) }, { headers });
    }
    if (input.action === 'EVIDENCE') {
      const submitted = await new db.PrismaTrainingAnswerRepository(db.prisma).submit({
        workspaceId: actor.scope.workspaceId,
        groupId: actor.scope.groupId,
        actorUserId: actor.actorUserId,
        programEnrollmentId: actor.scope.programEnrollmentId,
        missionAssignmentId: input.assignmentId,
        answer: input.content,
        practiceEvidence: {
          kind: input.kind,
          content: input.content,
          expectedRevision: input.expectedRevision,
          candidateId: input.candidateId,
          materialVersion: input.materialVersion,
        },
        idempotencyKey: input.idempotencyKey,
        occurredAt: new Date(),
      });
      if (submitted.outcome !== 'SUBMITTED' && submitted.outcome !== 'ALREADY_SUBMITTED') {
        if (submitted.outcome === 'NOT_FOUND')
          throw new ApplicationError('NOT_FOUND', 'practice unavailable');
        throw new ApplicationError('CONFLICT', 'practice submission changed');
      }
      await enqueueAiTrainingEvaluation({
        workspaceId: actor.scope.workspaceId,
        groupId: actor.scope.groupId,
        enrollmentId: actor.scope.programEnrollmentId,
        answerId: submitted.answer.id,
        actorUserId: actor.actorUserId,
        correlationId: input.idempotencyKey,
      });
      return Response.json({ data: await repo.readPractice(actor) }, { headers });
    }
    const data =
      input.action === 'START'
        ? await repo.startPractice({
            actor,
            requestId: input.requestId,
            requestRevision: input.requestRevision,
            candidateId: input.candidateId,
            ...(input.previousAssignmentId
              ? { previousAssignmentId: input.previousAssignmentId }
              : {}),
          })
        : await repo.recordPracticeNote({
            actor,
            assignmentId: input.assignmentId,
            operationId: input.operationId,
            expectedRevision: input.expectedRevision,
            text: input.text,
          });
    return Response.json({ data }, { headers });
  } catch (error) {
    const mapped = toApiError(
      error instanceof z.ZodError
        ? new ApplicationError('VALIDATION_ERROR', 'invalid practice input')
        : error,
      'learning-practice',
    );
    return Response.json(
      {
        error: {
          code: mapped.body.error.code,
          message: '実践を保存できませんでした。再読込して受講状態と現在の課題を確認してください。',
        },
      },
      { status: mapped.status, headers },
    );
  }
}
