import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import {
  PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
  definePersonalLearningPlan,
} from '@bunshin/application';
import { AI_TRAINING_LEARNING_DEFINITION_FIXTURES } from '@bunshin/capability-training';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePersonalLearningPilot } from '../services/personal-learning-pilot-access';
import { resolvePersonalLearningFocus } from '../services/personal-learning-focus';
const logger = createLogger();

const consultation = z
  .object({
    text: z.string().trim().min(1).max(2000),
    answers: z
      .array(
        z
          .object({
            questionKey: z.string().max(80),
            answerKey: z.string().max(80),
            candidateKey: z.string().max(4000).optional(),
          })
          .strict(),
      )
      .max(3),
  })
  .strict()
  .transform((value) => ({
    text: value.text,
    answers: value.answers.map((answer) => ({
      questionKey: answer.questionKey,
      answerKey: answer.answerKey,
      ...(answer.candidateKey === undefined ? {} : { candidateKey: answer.candidateKey }),
    })),
  }));
const body = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('PRACTICE'),
      assignmentId: z.string().uuid(),
      command: z.discriminatedUnion('action', [
        z
          .object({
            action: z.literal('START'),
            supportLevel: z.enum(['GUIDED', 'HINTED', 'INDEPENDENT']),
          })
          .strict(),
        z
          .object({
            action: z.literal('INTERACT'),
            interaction: z.enum(['SELF_PROMPTED', 'SELF_EVALUATED', 'SELF_REVISED']),
          })
          .strict(),
        z
          .object({
            action: z.literal('COMPLETE'),
            learnerConfirmedCompletion: z.literal(true),
            usefulResult: z.literal(true),
          })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({ operation: z.literal('CONSULT'), consultation, telemetryKey: z.string().uuid() })
    .strict(),
  z
    .object({
      operation: z.literal('CONFIRM_GOAL'),
      consultation,
      idempotencyKey: z.string().uuid(),
    })
    .strict(),
  z.object({ operation: z.literal('PREPARE_PLAN'), goalId: z.string().uuid() }).strict(),
  z
    .object({
      operation: z.literal('CONFIRM_PLAN'),
      planId: z.string().uuid(),
      revision: z.number().int().positive(),
      idempotencyKey: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('NEXT'),
      planId: z.string().uuid(),
      revision: z.number().int().positive(),
      idempotencyKey: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('FEEDBACK'),
      assignmentId: z.string().uuid(),
      fit: z.enum(['FIT', 'NEUTRAL', 'NOT_FIT']),
    })
    .strict(),
]);

export async function personalLearningPilotResponse(
  request: Request,
  serviceSlug: string,
  enrollmentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const respond = (data: unknown) =>
    Response.json({ data, requestId }, { headers: { 'cache-control': 'private, no-store' } });
  try {
    if (request.method !== 'GET') {
      requireSameOrigin(request);
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    }
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const input = await resolvePersonalLearningPilot(serviceSlug, enrollmentId, actor.userId);
    const db = await import('@bunshin/database');
    const repository = new db.PrismaPersonalLearningPilotRepository(db.prisma);
    if (request.method === 'GET') {
      const state = await repository.read(input);
      const current = state.plans.find((row) => row.isCurrent && row.goalActive);
      const assignment = current
        ? await repository.currentAssignment({
            ...input,
            planId: current.plan.planId,
            revision: current.plan.revision,
          })
        : null;
      return respond({
        state,
        assignment,
        learningFocus: resolvePersonalLearningFocus(current?.plan, assignment),
        readiness: await repository.readiness(input),
        practice: await new db.PrismaGuidedPracticeRepository(db.prisma).readPractice(
          input,
          assignment?.id ?? null,
        ),
      });
    }
    const value = body.parse(await request.json());
    const readiness = await repository.readiness(input);
    if (!readiness.profileReady && value.operation !== 'CONSULT')
      throw new ApplicationError('CONFLICT', 'pilot profile preparation required');
    if (value.operation === 'PRACTICE')
      return respond(
        await new db.PrismaGuidedPracticeRepository(db.prisma).recordPractice(
          input,
          value.assignmentId,
          value.command,
        ),
      );
    if (value.operation === 'CONSULT')
      return respond(
        await repository.consult({
          ...input,
          telemetryKey: value.telemetryKey,
          consultation: { ...value.consultation, scope: input.scope },
        }),
      );
    if (value.operation === 'CONFIRM_GOAL')
      return respond(
        await repository.confirmGoal({
          ...input,
          idempotencyKey: value.idempotencyKey,
          consultation: { ...value.consultation, scope: input.scope },
        }),
      );
    if (value.operation === 'PREPARE_PLAN') {
      const state = await repository.read(input);
      const goal = state.goals.find(
        (item) =>
          item.reference.reference.programMemberGoalId === value.goalId &&
          item.reference.reference.status === 'ACTIVE',
      );
      if (!goal) throw new ApplicationError('NOT_FOUND', 'goal unavailable');
      const existing = state.plans.find(
        (item) => item.isCurrent && item.plan.goal.reference.programMemberGoalId === value.goalId,
      );
      if (existing) return respond(existing.plan);
      // Exact approved Package mapping, recoverable after logout without storing consultation text.
      const stored = await db.prisma.programMemberGoal.findFirst({
        where: {
          id: value.goalId,
          workspaceId: input.scope.workspaceId,
          groupId: input.scope.groupId,
          programEnrollmentId: input.scope.programEnrollmentId,
          groupMembershipId: input.scope.groupMembershipId,
        },
      });
      let refs: readonly { packageKey: string; definitionKey: string; version: string }[] | null =
        null;
      for (const text of [
        'プロンプトを学びたい',
        'プロンプトの構造を学びたい',
        'プロンプトの背景設定を学びたい',
        'プロンプトの条件指定を学びたい',
      ]) {
        let result = await repository.consult({
          ...input,
          consultation: { scope: input.scope, text, answers: [] },
        });
        if (result.status === 'ASKING' && result.question.key === 'AI_EXPERIENCE')
          result = await repository.consult({
            ...input,
            consultation: {
              scope: input.scope,
              text,
              answers: [{ questionKey: 'AI_EXPERIENCE', answerKey: 'UNKNOWN' }],
            },
          });
        if (
          result.status === 'GOAL_CANDIDATE' &&
          result.candidate.learningObjective === stored?.title
        )
          refs = result.candidate.definitionRefs;
      }
      if (!refs) throw new ApplicationError('CONFLICT', 'learning plan mapping unavailable');
      const plan = definePersonalLearningPlan({
        contractVersion: PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
        ruleVersion: PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
        planId: value.goalId,
        revision: 1,
        previousRevision: null,
        revisionReason: 'INITIAL',
        scope: input.scope,
        goal: goal.reference,
        status: 'DRAFT',
        confirmation: null,
        steps: refs.map((ref) => ({
          definition: ref,
          selectionReason: 'GOAL_ALIGNMENT',
          prerequisites:
            AI_TRAINING_LEARNING_DEFINITION_FIXTURES.find(
              (item) => item.reference.definitionKey === ref.definitionKey,
            )?.prerequisites ?? [],
        })),
      });
      await repository.savePlan({
        ...input,
        plan,
        expectedRevision: 0,
        idempotencyKey: `pilot_plan_${value.goalId}`,
      });
      return respond(plan);
    }
    if (value.operation === 'CONFIRM_PLAN')
      return respond(
        await repository.confirmPlan({
          ...input,
          planId: value.planId,
          expectedRevision: value.revision,
          idempotencyKey: value.idempotencyKey,
        }),
      );
    if (value.operation === 'NEXT') {
      const receipt = await new db.PrismaPersonalLearningPilotRouter(db.prisma).bridge({
        ...input,
        planId: value.planId,
        expectedRevision: value.revision,
        idempotencyKey: value.idempotencyKey,
      });
      logger.info('personal learning pilot router', {
        requestId,
        status: receipt.result.status,
        reason: receipt.result.reason,
      });
      return respond(receipt);
    }
    return respond(
      await repository.feedback({ ...input, assignmentId: value.assignmentId, fit: value.fit }),
    );
  } catch (error) {
    const mapped = toApiError(
      error instanceof z.ZodError || error instanceof SyntaxError
        ? new ApplicationError('VALIDATION_ERROR', 'invalid pilot input')
        : error,
      requestId,
    );
    logger.error('personal learning pilot request failed', {
      requestId,
      code: mapped.body.error.code,
    });
    // Never emit consultation text or generic Error.message (which may contain user input).
    return Response.json(
      {
        error: {
          code: mapped.body.error.code,
          message: '学習状態を確認できませんでした。もう一度お試しください。',
        },
        requestId,
      },
      { status: mapped.status, headers: { 'cache-control': 'private, no-store' } },
    );
  }
}
