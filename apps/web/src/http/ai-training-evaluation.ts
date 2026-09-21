import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import {
  OpenAiTrainingAnswerEvaluator,
  TRAINING_EVALUATION_PROMPT_VERSION,
} from '../providers/openai-training-answer-evaluator';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { resolveMemberServiceContext } from '../services/public-service';

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

export async function evaluateAiTrainingAnswerResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
  rawAnswerId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, body] = await Promise.all([
      resolveMemberServiceContext(serviceSlug, actor.userId),
      bodySchema.parseAsync(request.json()),
    ]);
    const enrollmentId = uuid.parse(rawEnrollmentId);
    const answerId = uuid.parse(rawAnswerId);
    const db = await import('@bunshin/database');
    const [enrollment, membership] = await Promise.all([
      db.prisma.programEnrollment.findFirst({
        where: {
          id: enrollmentId,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          status: 'ACTIVE',
        },
        select: { groupMembershipId: true },
      }),
      db.prisma.groupMembership.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          userId: actor.userId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    ]);
    if (!enrollment || !membership || enrollment.groupMembershipId !== membership.id)
      throw new ApplicationError('NOT_FOUND', 'training answer not found');
    const answer = await db.prisma.trainingMissionAnswer.findFirst({
      where: {
        id: answerId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        programEnrollmentId: enrollmentId,
        userId: actor.userId,
      },
    });
    if (!answer) throw new ApplicationError('NOT_FOUND', 'training answer not found');
    if (answer.evaluationStatus === 'READY')
      return response({ status: 'ALREADY_EVALUATED', evaluation: answer.evaluation }, requestId);
    const assignment = await db.prisma.programMissionAssignment.findFirst({
      where: {
        id: answer.missionAssignmentId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        programEnrollmentId: enrollmentId,
      },
      select: { missionDefinitionKey: true, displaySnapshot: true },
    });
    if (!assignment) throw new ApplicationError('NOT_FOUND', 'training mission not found');
    const runtime = await resolveOpenAiRuntimeConfiguration();
    const operationKey = `training-evaluation:${answer.id}`;
    const started = Date.now();
    let providerAttempted = false;
    let evaluated: Awaited<ReturnType<OpenAiTrainingAnswerEvaluator['evaluate']>>;
    try {
      evaluated = await withOrganizationAiGenerationQuota({
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        operationKey,
        generate: () => {
          providerAttempted = true;
          return new OpenAiTrainingAnswerEvaluator({
            apiKey: runtime.apiKey,
            model: runtime.model,
            requestCostUsdMicros: runtime.requestCostUsdMicros,
          }).evaluate({
            missionDefinitionKey: assignment.missionDefinitionKey,
            answer: answer.answer,
            displaySnapshot: assignment.displaySnapshot,
          });
        },
      });
      await recordAiUsageSafely({
        workspaceId: service.workspaceId,
        bunshinId: null,
        actorUserId: actor.userId,
        taskType: 'AI_TRAINING_ANSWER_EVALUATION',
        provider: evaluated.provider,
        model: evaluated.model,
        promptVersion: evaluated.promptVersion,
        status: 'SUCCESS',
        inputTokens: evaluated.inputTokens,
        outputTokens: evaluated.outputTokens,
        latencyMs: evaluated.latencyMs,
        estimatedCostUsdMicros: evaluated.estimatedCostUsdMicros,
        pricingVersion: evaluated.estimatedCostUsdMicros ? 'admin-request-cost-v1' : null,
        idempotencyKey: operationKey,
      });
    } catch (error) {
      await recordAiUsageSafely({
        workspaceId: service.workspaceId,
        bunshinId: null,
        actorUserId: actor.userId,
        taskType: 'AI_TRAINING_ANSWER_EVALUATION',
        provider: 'openai',
        model: runtime.model,
        promptVersion: TRAINING_EVALUATION_PROMPT_VERSION,
        status: 'FAILED',
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - started,
        estimatedCostUsdMicros:
          providerAttempted && runtime.requestCostUsdMicros ? runtime.requestCostUsdMicros : null,
        pricingVersion:
          providerAttempted && runtime.requestCostUsdMicros ? 'admin-request-cost-v1' : null,
        errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
        idempotencyKey: operationKey,
      });
      throw error;
    }
    const result = await db.prisma.$transaction(async (tx) => {
      const evaluatedAt = new Date();
      const updated = await tx.trainingMissionAnswer.updateMany({
        where: { id: answer.id, evaluationStatus: 'PENDING' },
        data: {
          evaluationStatus: 'READY',
          evaluation: {
            ...evaluated.evaluation,
            provider: evaluated.provider,
            model: evaluated.model,
            promptVersion: evaluated.promptVersion,
            inputTokens: evaluated.inputTokens,
            outputTokens: evaluated.outputTokens,
            latencyMs: evaluated.latencyMs,
          },
          evaluatedAt,
        },
      });
      if (updated.count !== 1) return 'ALREADY_EVALUATED' as const;
      await tx.programActionEvent.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          programEnrollmentId: enrollmentId,
          missionAssignmentId: answer.missionAssignmentId,
          eventType: 'ANSWER_EVALUATED',
          sourceResourceType: 'TRAINING_MISSION_ANSWER',
          sourceResourceId: answer.id,
          idempotencyKey: body.idempotencyKey,
          schemaVersion: 1,
          metadata: {
            result: evaluated.evaluation.result,
            understanding: evaluated.evaluation.understanding,
          },
          actorUserId: actor.userId,
          occurredAt: evaluatedAt,
        },
      });
      const passed = evaluated.evaluation.result === 'PASS';
      await tx.programMissionAssignment.updateMany({
        where: {
          id: answer.missionAssignmentId,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          programEnrollmentId: enrollmentId,
          status: { in: ['PRESENTED', 'STARTED'] },
        },
        data: passed
          ? { status: 'COMPLETED', completedAt: evaluatedAt }
          : { status: 'SKIPPED', skippedAt: evaluatedAt },
      });
      await tx.programActionEvent.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          programEnrollmentId: enrollmentId,
          missionAssignmentId: answer.missionAssignmentId,
          eventType: passed ? 'MISSION_COMPLETED' : 'MISSION_SKIPPED',
          sourceResourceType: 'TRAINING_MISSION_ANSWER',
          sourceResourceId: answer.id,
          idempotencyKey: `${body.idempotencyKey}:mission`,
          schemaVersion: 1,
          metadata: { reason: passed ? 'TRAINING_ANSWER_PASSED' : 'TRAINING_REVIEW_REQUIRED' },
          actorUserId: actor.userId,
          occurredAt: evaluatedAt,
        },
      });
      await tx.trainingParticipantProfile.updateMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          programEnrollmentId: enrollmentId,
          userId: actor.userId,
        },
        data: passed
          ? {
              needsReview: false,
              recentSuccesses: { increment: 1 },
              recentFailures: 0,
              streak: { increment: 1 },
            }
          : {
              needsReview: true,
              recentFailures: { increment: 1 },
              recentSuccesses: 0,
              streak: 0,
            },
      });
      await tx.programProgressSnapshot.updateMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          programEnrollmentId: enrollmentId,
        },
        data: {
          currentAssignmentId: null,
          bottleneckKey: passed ? null : 'TRAINING_REVIEW_REQUIRED',
          ...(passed ? { completedMissionCount: { increment: 1 } } : {}),
          revision: { increment: 1 },
          lastActionAt: evaluatedAt,
          nextEvaluationAt: null,
          calculatedAt: evaluatedAt,
        },
      });
      return 'EVALUATED' as const;
    });
    return response({ status: result, evaluation: evaluated.evaluation }, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
