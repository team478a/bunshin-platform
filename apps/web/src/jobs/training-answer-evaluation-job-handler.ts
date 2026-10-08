import 'server-only';

import {
  TrainingAnswerEvaluationJobError,
  type TrainingAnswerEvaluationJobHandler,
  type AiCallMeasurement,
} from '@bunshin/application';
import {
  AI_TRAINING_V1_MODULE_KEY,
  isPersonalLearningPilotProgram,
  mergeTrainingSkillScores,
  trainingSkillBottleneckKey,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import { personalLearningPilotExecutionAllowed } from '../services/personal-learning-pilot-access';
import { admitPersonalLearningCall } from '../services/personal-learning-call-admission';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { preparePersonalLearningAiCall } from '../observability/personal-learning-ai-call';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import {
  OpenAiTrainingAnswerEvaluator,
  TRAINING_EVALUATION_PROMPT_VERSION,
} from '../providers/openai-training-answer-evaluator';

export function createTrainingAnswerEvaluationJobHandler(): TrainingAnswerEvaluationJobHandler {
  return {
    async execute(input) {
      const db = await import('@bunshin/database');
      const membership = await db.prisma.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          serviceRole: { in: ['PARTICIPANT', 'SERVICE_OWNER'] },
          status: 'ACTIVE',
        },
        select: { id: true, serviceRole: true },
      });
      if (!membership) {
        throw new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_SCOPE_REVOKED', false);
      }
      const enrollment = await db.prisma.programEnrollment.findFirst({
        where: {
          id: input.enrollmentId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: membership.id,
          status: 'ACTIVE',
          startsAt: { not: null },
          AND: [db.trainingEnrollmentPeriodWhere(new Date())],
        },
        select: { id: true, serviceProgramId: true },
      });
      if (!enrollment) {
        throw new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_SCOPE_REVOKED', false);
      }
      if (membership.serviceRole === 'SERVICE_OWNER') {
        try {
          await db.prisma.$transaction((tx) =>
            db.requireTrainingLearnerRole(
              tx,
              {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                programEnrollmentId: enrollment.id,
                userId: input.actorUserId,
              },
              membership.serviceRole,
            ),
          );
        } catch (error) {
          if (error instanceof ApplicationError && error.code === 'NOT_FOUND')
            throw new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_SCOPE_REVOKED', false);
          throw error;
        }
      }
      const program = await db.prisma.serviceProgram.findFirst({
        where: {
          id: enrollment.serviceProgramId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'ACTIVE',
          settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
        },
        select: { id: true, settings: true },
      });
      if (!program || !personalLearningPilotExecutionAllowed(program.settings, enrollment.id)) {
        throw new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_SCOPE_REVOKED', false);
      }
      const answer = await db.prisma.trainingMissionAnswer.findFirst({
        where: {
          id: input.answerId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          userId: input.actorUserId,
        },
      });
      if (!answer) {
        throw new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_ANSWER_NOT_FOUND', false);
      }
      if (answer.evaluationStatus === 'READY') return;
      if (answer.evaluationStatus !== 'PENDING') {
        throw new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_NOT_PENDING', false);
      }
      const assignment = await db.prisma.programMissionAssignment.findFirst({
        where: {
          id: answer.missionAssignmentId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
        },
        select: { missionDefinitionKey: true, displaySnapshot: true, targetResourceType: true },
      });
      if (!assignment) {
        throw new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_MISSION_NOT_FOUND', false);
      }
      const requirePilot =
        isPersonalLearningPilotProgram(program.settings) ||
        assignment.targetResourceType === 'PERSONAL_LEARNING_PLAN';
      if (!personalLearningPilotExecutionAllowed(program.settings, enrollment.id, requirePilot))
        throw new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_SCOPE_REVOKED', false);
      const runtime = await resolveOpenAiRuntimeConfiguration();
      const pilot = requirePilot
        ? await preparePersonalLearningAiCall(
            {
              actorUserId: input.actorUserId,
              scope: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                programEnrollmentId: enrollment.id,
                groupMembershipId: membership.id,
                userId: input.actorUserId,
              },
            },
            answer.missionAssignmentId,
            answer.id,
          )
        : null;
      const observed: { measurement: AiCallMeasurement | null } = { measurement: null };
      const operationKey = `training-evaluation:${answer.id}:${input.jobId}:attempt:${input.attemptCount}`;
      const usageKey = operationKey;
      const started = Date.now();
      let providerAttempted = false;
      let providerSucceeded = false;
      let pilotRequestStarted = false;
      let evaluated: Awaited<ReturnType<OpenAiTrainingAnswerEvaluator['evaluate']>>;
      try {
        evaluated = await withOrganizationAiGenerationQuota({
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          operationKey,
          generate: async () => {
            const allowed = await db.prisma.programEnrollment.findFirst({
              where: {
                id: enrollment.id,
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                groupMembershipId: membership.id,
                status: 'ACTIVE',
                AND: [db.trainingEnrollmentPeriodWhere(new Date())],
              },
              select: { id: true },
            });
            if (!allowed) {
              throw new TrainingAnswerEvaluationJobError(
                'TRAINING_EVALUATION_SCOPE_REVOKED',
                false,
              );
            }
            if (requirePilot) {
              const currentProgram = await db.prisma.serviceProgram.findFirst({
                where: {
                  id: enrollment.serviceProgramId,
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  status: 'ACTIVE',
                },
                select: { settings: true },
              });
              if (
                !currentProgram ||
                !personalLearningPilotExecutionAllowed(currentProgram.settings, enrollment.id, true)
              ) {
                throw new TrainingAnswerEvaluationJobError(
                  'TRAINING_EVALUATION_SCOPE_REVOKED',
                  false,
                );
              }
              await new db.PrismaPersonalLearningAssessmentGate(db.prisma).authorizeAssessment(
                {
                  actorUserId: input.actorUserId,
                  scope: {
                    workspaceId: input.workspaceId,
                    groupId: input.groupId,
                    programEnrollmentId: enrollment.id,
                    groupMembershipId: membership.id,
                    userId: input.actorUserId,
                  },
                },
                answer.missionAssignmentId,
                answer.id,
              );
              // Recheck the environment switch after asynchronous DB authorization.
              if (
                !personalLearningPilotExecutionAllowed(currentProgram.settings, enrollment.id, true)
              )
                throw new TrainingAnswerEvaluationJobError(
                  'TRAINING_EVALUATION_SCOPE_REVOKED',
                  false,
                );
            }
            const admission = requirePilot
              ? await admitPersonalLearningCall({
                  actor: {
                    actorUserId: input.actorUserId,
                    scope: {
                      workspaceId: input.workspaceId,
                      groupId: input.groupId,
                      programEnrollmentId: enrollment.id,
                      groupMembershipId: membership.id,
                      userId: input.actorUserId,
                    },
                  },
                  assignmentId: answer.missionAssignmentId,
                  answerId: answer.id,
                  jobId: input.jobId,
                  attemptCount: input.attemptCount,
                  model: runtime.model,
                })
              : null;
            let requestStarted = false;
            let responseSettled = false;
            try {
              if (
                requirePilot &&
                !personalLearningPilotExecutionAllowed(program.settings, enrollment.id, true)
              )
                throw new TrainingAnswerEvaluationJobError(
                  'TRAINING_EVALUATION_SCOPE_REVOKED',
                  false,
                );
              providerAttempted = true;
              return await new OpenAiTrainingAnswerEvaluator({
                apiKey: runtime.apiKey,
                model: runtime.model,
                requestCostUsdMicros: runtime.requestCostUsdMicros,
                ...(admission
                  ? {
                      requestLimits: admission.requestLimits,
                      onResponseSettled: () => {
                        responseSettled = true;
                      },
                    }
                  : {}),
                ...(pilot
                  ? {
                      observe: (measurement: AiCallMeasurement) => {
                        observed.measurement = measurement;
                      },
                      onRequestStarted: () => {
                        pilotRequestStarted = true;
                        requestStarted = true;
                      },
                    }
                  : {}),
              }).evaluate({
                missionDefinitionKey: assignment.missionDefinitionKey,
                answer: answer.answer,
                displaySnapshot: assignment.displaySnapshot,
              });
            } finally {
              if (admission && (!requestStarted || responseSettled)) await admission.settle();
            }
          },
        });
        providerSucceeded = true;
        const pilotCost = pilot && observed.measurement ? pilot.cost(observed.measurement) : null;
        await recordAiUsageSafely({
          workspaceId: input.workspaceId,
          bunshinId: null,
          actorUserId: input.actorUserId,
          taskType: 'AI_TRAINING_ANSWER_EVALUATION',
          provider: evaluated.provider,
          model: pilot ? (observed.measurement?.model ?? 'unknown') : evaluated.model,
          promptVersion: evaluated.promptVersion,
          status: 'SUCCESS',
          inputTokens: pilot ? (observed.measurement?.inputTokens ?? null) : evaluated.inputTokens,
          outputTokens: pilot
            ? (observed.measurement?.outputTokens ?? null)
            : evaluated.outputTokens,
          latencyMs: evaluated.latencyMs,
          estimatedCostUsdMicros: pilot
            ? (pilotCost?.totalCostUsdMicros ?? null)
            : evaluated.estimatedCostUsdMicros,
          pricingVersion: pilot
            ? (pilotCost?.pricing?.pricingVersion ?? null)
            : evaluated.estimatedCostUsdMicros
              ? 'admin-request-cost-v1'
              : null,
          idempotencyKey: usageKey,
        });
      } catch (error) {
        if (error instanceof TrainingAnswerEvaluationJobError) throw error;
        if (
          requirePilot &&
          !providerAttempted &&
          error instanceof ApplicationError &&
          ['NOT_FOUND', 'FORBIDDEN', 'CONFLICT', 'VALIDATION_ERROR'].includes(error.code)
        )
          throw new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_SCOPE_REVOKED', false);
        await recordAiUsageSafely({
          workspaceId: input.workspaceId,
          bunshinId: null,
          actorUserId: input.actorUserId,
          taskType: 'AI_TRAINING_ANSWER_EVALUATION',
          provider: 'openai',
          model: pilot ? (observed.measurement?.model ?? 'unknown') : runtime.model,
          promptVersion: TRAINING_EVALUATION_PROMPT_VERSION,
          status: 'FAILED',
          inputTokens: pilot ? (observed.measurement?.inputTokens ?? null) : null,
          outputTokens: pilot ? (observed.measurement?.outputTokens ?? null) : null,
          latencyMs: Date.now() - started,
          estimatedCostUsdMicros: pilot
            ? observed.measurement
              ? pilot.cost(observed.measurement).totalCostUsdMicros
              : null
            : providerAttempted && runtime.requestCostUsdMicros
              ? runtime.requestCostUsdMicros
              : null,
          pricingVersion: pilot
            ? observed.measurement
              ? (pilot.cost(observed.measurement).pricing?.pricingVersion ?? null)
              : null
            : providerAttempted && runtime.requestCostUsdMicros
              ? 'admin-request-cost-v1'
              : null,
          errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
          idempotencyKey: usageKey,
        });
        if (error instanceof ApplicationError && error.code !== 'AI_PROVIDER_UNAVAILABLE') {
          throw new TrainingAnswerEvaluationJobError(
            `TRAINING_EVALUATION_${error.code}`,
            !['VALIDATION_ERROR', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT'].includes(error.code),
          );
        }
        throw new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_PROVIDER_ERROR', true);
      } finally {
        if (pilot && pilotRequestStarted) {
          await pilot.record(
            usageKey,
            observed.measurement ?? {
              provider: 'openai',
              model: /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(runtime.model)
                ? runtime.model
                : 'unknown',
              inputTokens: null,
              outputTokens: null,
              cachedInputTokens: null,
              latencyMs: Math.max(0, Date.now() - started),
              success: providerSucceeded,
              errorCategory: providerSucceeded ? null : 'UNKNOWN',
              validationResult: providerSucceeded ? 'PASSED' : 'NOT_RUN',
              fallbackUsed: false,
              occurredAt: new Date(started).toISOString(),
            },
          );
        }
      }

      await db.prisma.$transaction(async (tx) => {
        await db.lockTrainingEnrollmentData(tx, {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          actorUserId: input.actorUserId,
          programEnrollmentId: enrollment.id,
        });
        const evaluatedAt = new Date();
        const stillActive = await tx.programEnrollment.findFirst({
          where: {
            id: enrollment.id,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: membership.id,
            status: 'ACTIVE',
            AND: [db.trainingEnrollmentPeriodWhere(evaluatedAt)],
          },
          select: { id: true },
        });
        if (!stillActive) {
          throw new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_SCOPE_REVOKED', false);
        }
        const updated = await tx.trainingMissionAnswer.updateMany({
          where: {
            id: answer.id,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            userId: input.actorUserId,
            evaluationStatus: 'PENDING',
          },
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
        if (updated.count !== 1) return;
        const participantProfile = await tx.trainingParticipantProfile.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            userId: input.actorUserId,
          },
          select: { skillScores: true },
        });
        if (!participantProfile) {
          throw new ApplicationError('NOT_FOUND', 'training participant profile not found');
        }
        const skillScores = mergeTrainingSkillScores(
          participantProfile.skillScores,
          evaluated.evaluation,
        );
        await tx.programActionEvent.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            missionAssignmentId: answer.missionAssignmentId,
            eventType: 'ANSWER_EVALUATED',
            sourceResourceType: 'TRAINING_MISSION_ANSWER',
            sourceResourceId: answer.id,
            idempotencyKey: `training-evaluation:${answer.id}:evaluated`,
            schemaVersion: 1,
            metadata: {
              result: evaluated.evaluation.result,
              understanding: evaluated.evaluation.understanding,
              skills: evaluated.evaluation.skills,
              evaluatedSkillKeys: evaluated.evaluation.evaluatedSkillKeys,
              recommendedNextSkill: evaluated.evaluation.recommendedNextSkill,
              evaluationRuleVersion: evaluated.evaluation.evaluationRuleVersion,
            },
            actorUserId: input.actorUserId,
            occurredAt: evaluatedAt,
          },
        });
        const passed = evaluated.evaluation.result === 'PASS';
        await tx.programMissionAssignment.updateMany({
          where: {
            id: answer.missionAssignmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            status: { in: ['PRESENTED', 'STARTED'] },
          },
          data: passed
            ? { status: 'COMPLETED', completedAt: evaluatedAt }
            : { status: 'SKIPPED', skippedAt: evaluatedAt },
        });
        await tx.programActionEvent.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            missionAssignmentId: answer.missionAssignmentId,
            eventType: passed ? 'MISSION_COMPLETED' : 'MISSION_SKIPPED',
            sourceResourceType: 'TRAINING_MISSION_ANSWER',
            sourceResourceId: answer.id,
            idempotencyKey: `training-evaluation:${answer.id}:mission`,
            schemaVersion: 1,
            metadata: { reason: passed ? 'TRAINING_ANSWER_PASSED' : 'TRAINING_REVIEW_REQUIRED' },
            actorUserId: input.actorUserId,
            occurredAt: evaluatedAt,
          },
        });
        await tx.trainingParticipantProfile.updateMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            userId: input.actorUserId,
          },
          data: passed
            ? {
                needsReview: false,
                recentSuccesses: { increment: 1 },
                recentFailures: 0,
                streak: { increment: 1 },
                skillScores,
                currentTopic: evaluated.evaluation.recommendedNextSkill,
              }
            : {
                needsReview: true,
                recentFailures: { increment: 1 },
                recentSuccesses: 0,
                streak: 0,
                skillScores,
                currentTopic: evaluated.evaluation.recommendedNextSkill,
              },
        });
        await tx.programProgressSnapshot.updateMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
          },
          data: {
            currentAssignmentId: null,
            bottleneckKey: passed
              ? null
              : trainingSkillBottleneckKey(evaluated.evaluation.recommendedNextSkill),
            ...(passed ? { completedMissionCount: { increment: 1 } } : {}),
            revision: { increment: 1 },
            lastActionAt: evaluatedAt,
            nextEvaluationAt: null,
            calculatedAt: evaluatedAt,
          },
        });
      });
    },

    async markFailed(input) {
      const db = await import('@bunshin/database');
      await db.prisma.trainingMissionAnswer.updateMany({
        where: {
          id: input.answerId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: input.enrollmentId,
          userId: input.actorUserId,
          evaluationStatus: 'PENDING',
        },
        data: {
          evaluationStatus: 'FAILED',
          evaluation: { schemaVersion: 1, errorCode: input.errorCode },
          evaluatedAt: new Date(),
        },
      });
    },
  };
}
