import 'server-only';
import {
  AiTrainingParticipantService,
  AiTrainingV1Policy,
  TRAINING_CHALLENGE_KEYS,
  TRAINING_GOAL_KEYS,
  TRAINING_AI_LEVELS,
  TRAINING_INTERACTION_TYPES,
  TRAINING_ROLES,
  TRAINING_TOPIC_KEYS,
  TRAINING_USE_CASE_KEYS,
  TRAINING_DEVICE_TYPES,
  TRAINING_WORK_RESULTS,
  TRAINING_BARRIER_REASONS,
  TrainingRuntimeError,
} from '@bunshin/capability-training';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';
import { enqueueAiTrainingEvaluation } from '../services/ai-training-evaluation-queue';
import { requirePersonalLearningPilotForReservedProgram } from '../services/personal-learning-pilot-access';

const uuid = z.string().uuid();
const submissionSchema = z
  .object({
    missionAssignmentId: uuid,
    answer: z.string().trim().min(1).max(10_000),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
const profileSchema = z
  .object({
    role: z.enum(TRAINING_ROLES),
    aiLevel: z.enum(TRAINING_AI_LEVELS),
    aiUseCases: z.array(z.enum(TRAINING_USE_CASE_KEYS)).min(1).max(6),
    workChallenges: z.array(z.enum(TRAINING_CHALLENGE_KEYS)).min(1).max(6),
    preferredTopics: z.array(z.enum(TRAINING_TOPIC_KEYS)).min(1).max(6),
    dailyMinutes: z.union([z.literal(5), z.literal(10), z.literal(15)]),
    learningGoalKey: z.enum(TRAINING_GOAL_KEYS),
    workContext: z
      .object({
        schemaVersion: z.literal(1),
        workDescription: z.string().trim().min(5).max(240),
        timeConsumingTask: z.string().trim().min(2).max(160),
        aiImprovementTarget: z.string().trim().min(2).max(160),
        deviceType: z.enum(TRAINING_DEVICE_TYPES),
      })
      .strict(),
    idempotencyKey: uuid,
  })
  .superRefine((value, context) => {
    if (value.aiUseCases.includes('NOT_YET') && value.aiUseCases.length > 1) {
      context.addIssue({
        code: 'custom',
        path: ['aiUseCases'],
        message: '「まだ使っていない」は単独で選択してください',
      });
    }
  })
  .strict();
const interactionSchema = z
  .object({
    missionAssignmentId: uuid,
    interactionType: z.enum(TRAINING_INTERACTION_TYPES),
    idempotencyKey: uuid,
  })
  .strict();
const barrierActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('BARRIER'), reason: z.enum(TRAINING_BARRIER_REASONS) }).strict(),
  z.object({ type: z.literal('RESTORE_STANDARD') }).strict(),
]);
const barrierSchema = z
  .object({
    missionAssignmentId: uuid,
    action: barrierActionSchema,
    idempotencyKey: uuid,
  })
  .strict();
const toolkitSaveSchema = z.object({ answerId: uuid, idempotencyKey: uuid }).strict();
const workResultSchema = z
  .object({
    missionAssignmentId: uuid,
    result: z.enum(TRAINING_WORK_RESULTS),
    idempotencyKey: uuid,
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

export async function saveAiTrainingProfileResponse(
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
      profileSchema.parseAsync(request.json()),
    ]);
    const programEnrollmentId = uuid.parse(rawEnrollmentId);
    const db = await import('@bunshin/database');
    const result = await new db.PrismaTrainingParticipantProfileRepository(db.prisma).save({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId,
      ...value,
      occurredAt: new Date(),
    });
    if (result.outcome === 'NOT_FOUND') {
      throw new ApplicationError('NOT_FOUND', 'AI training enrollment not found');
    }
    if (result.outcome === 'CONFLICT') {
      throw new ApplicationError('CONFLICT', 'AI training profile could not be saved');
    }
    const state = await new AiTrainingParticipantService(
      new db.PrismaAiTrainingRuntimeRepository(db.prisma),
      new AiTrainingV1Policy(),
    ).current({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId,
      now: new Date(),
    });
    return response({ status: result.outcome, state }, requestId);
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
    await requirePersonalLearningPilotForReservedProgram(
      serviceSlug,
      uuid.parse(rawEnrollmentId),
      actor.userId,
      service,
    );
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
    const submitted = result as {
      outcome: 'SUBMITTED' | 'ALREADY_SUBMITTED';
      answer: { id: string };
    };
    await enqueueAiTrainingEvaluation({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      enrollmentId: uuid.parse(rawEnrollmentId),
      answerId: submitted.answer.id,
      actorUserId: actor.userId,
      correlationId: requestId,
    });
    return response(result, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function recordAiTrainingInteractionResponse(
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
      interactionSchema.parseAsync(request.json()),
    ]);
    const db = await import('@bunshin/database');
    await requirePersonalLearningPilotForReservedProgram(
      serviceSlug,
      uuid.parse(rawEnrollmentId),
      actor.userId,
      service,
    );
    const result = await new db.PrismaTrainingInteractionRepository(db.prisma).record({
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
      throw new ApplicationError('CONFLICT', 'training interaction could not be recorded');
    }
    return response(result, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function recordAiTrainingBarrierResponse(
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
      barrierSchema.parseAsync(request.json()),
    ]);
    const db = await import('@bunshin/database');
    const result = await new db.PrismaTrainingBarrierRepository(db.prisma).record({
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
      throw new ApplicationError('CONFLICT', 'training mission can no longer be adjusted');
    }
    return response(result, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function recordAiTrainingWorkResultResponse(
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
      workResultSchema.parseAsync(request.json()),
    ]);
    const db = await import('@bunshin/database');
    const result = await new db.PrismaTrainingWorkResultRepository(db.prisma).record({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId: uuid.parse(rawEnrollmentId),
      ...value,
      occurredAt: new Date(),
    });
    if (result.outcome === 'NOT_FOUND') {
      throw new ApplicationError('NOT_FOUND', 'completed training mission not found');
    }
    if (result.outcome === 'CONFLICT') {
      throw new ApplicationError('CONFLICT', 'training work result could not be recorded');
    }
    return response(result, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function listAiTrainingToolkitResponse(
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
    const items = await new db.PrismaTrainingToolkitRepository(db.prisma).list({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId: uuid.parse(rawEnrollmentId),
    });
    if (!items) throw new ApplicationError('NOT_FOUND', 'AI training toolkit not found');
    return response({ items }, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function saveAiTrainingToolkitItemResponse(
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
      toolkitSaveSchema.parseAsync(request.json()),
    ]);
    const db = await import('@bunshin/database');
    const result = await new db.PrismaTrainingToolkitRepository(db.prisma).save({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId: uuid.parse(rawEnrollmentId),
      ...value,
      occurredAt: new Date(),
    });
    if (result.outcome === 'NOT_FOUND') {
      throw new ApplicationError('NOT_FOUND', 'evaluated training answer not found');
    }
    if (result.outcome === 'NOT_ELIGIBLE') {
      throw new ApplicationError('CONFLICT', 'only passed training answers can be saved');
    }
    if (result.outcome === 'CONFLICT') {
      throw new ApplicationError('CONFLICT', 'training toolkit item could not be saved');
    }
    return response(result, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
