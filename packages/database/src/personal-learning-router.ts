import type { Prisma } from '@prisma/client';
import {
  validatePersonalLearningWrite,
  type LearningRouterBridgeRequest,
  type LearningRouterBridgeReceipt,
  type PersonalLearningRouterBridge,
} from '@bunshin/application';
import {
  AI_TRAINING_LEARNING_ROUTER_VERSION,
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  learningDefinitionIdentity,
  routeAiTrainingLearning,
  renderAiTrainingAction,
  type AiTrainingDefinitionEvidence,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import { PrismaPersonalLearningPersistenceRepository } from './personal-learning-persistence';
import { resolveScope } from './training-runtime-shared';

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Server-internal opt-in bridge. No scheduler registration, Provider or new execution store. */
export class PrismaPersonalLearningRouterBridge
  extends PrismaPersonalLearningPersistenceRepository
  implements PersonalLearningRouterBridge
{
  async bridge(input: LearningRouterBridgeRequest): Promise<LearningRouterBridgeReceipt> {
    validatePersonalLearningWrite(input);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.planId) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid learning router request');
    return this.authorized(input, true, async (tx, now) => {
      const s = input.scope;
      const stop = (
        status: 'UNKNOWN' | 'BLOCKED',
        reason: string,
      ): LearningRouterBridgeReceipt => ({
        result: {
          status,
          reason,
          ruleVersion: AI_TRAINING_LEARNING_ROUTER_VERSION,
          definition: null,
        },
        assignmentId: null,
      });
      const row = await tx.personalLearningPlanRevision.findFirst({
        where: { ...s, planId: input.planId },
        orderBy: { revision: 'desc' },
        include: { goalConfirmation: { include: { goal: true } } },
      });
      if (!row) throw new ApplicationError('NOT_FOUND', 'learning plan not found');
      if (row.revision !== input.expectedRevision) return stop('BLOCKED', 'PLAN_REVISION_CHANGED');
      if (row.goalConfirmation.goal.status !== 'ACTIVE') return stop('BLOCKED', 'GOAL_NOT_ACTIVE');
      if (row.status !== 'CONFIRMED') return stop('BLOCKED', 'PLAN_NOT_CONFIRMED');
      await tx.$queryRaw`SELECT id FROM program_member_goals
        WHERE id=${row.programMemberGoalId}::uuid FOR SHARE`;
      if (
        (await tx.programMemberGoal.count({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            groupMembershipId: s.groupMembershipId,
            status: 'ACTIVE',
          },
        })) !== 1
      )
        return stop('BLOCKED', 'PRIMARY_GOAL_CONFLICT');
      const runtime = await resolveScope(
        tx,
        {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          actorUserId: s.userId,
        },
        ['ACTIVE'],
        now,
      );
      if (!runtime) return stop('BLOCKED', 'RUNTIME_SCOPE_NOT_AVAILABLE');
      const profile = await tx.trainingParticipantProfile.findFirst({ where: { ...s } });
      if (!profile) return stop('BLOCKED', 'ASSESSMENT_PROFILE_MISSING');
      const plan = this.restore(row);
      const approvedRefs = await this.approved(tx, input);
      if (
        plan.steps.some(
          (step) =>
            !approvedRefs.some(
              (ref) =>
                learningDefinitionIdentity(ref) === learningDefinitionIdentity(step.definition),
            ),
        )
      )
        return stop('BLOCKED', 'DEFINITION_NOT_APPROVED');
      const receiptKey = `PERSONAL_LEARNING_BRIDGE_${input.idempotencyKey}`;
      const prior = await tx.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            idempotencyKey: receiptKey,
          },
        },
      });
      if (prior) {
        const data = object(prior.metadata);
        if (
          prior.actorUserId !== s.userId ||
          prior.programEnrollmentId !== s.programEnrollmentId ||
          prior.eventType !== 'PERSONAL_LEARNING_ASSIGNMENT_BRIDGED' ||
          data.planId !== input.planId ||
          data.planRevision !== input.expectedRevision
        )
          throw new ApplicationError('CONFLICT', 'learning bridge idempotency conflict');
        return {
          result: data.result as LearningRouterBridgeReceipt['result'],
          assignmentId: prior.missionAssignmentId,
        };
      }
      const assignments = await tx.programMissionAssignment.findMany({
        where: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
        },
        orderBy: { sequence: 'desc' },
        take: 1001,
      });
      if (assignments.length > 1000) return stop('UNKNOWN', 'EVIDENCE_LIMIT_EXCEEDED');
      const evidence: AiTrainingDefinitionEvidence[] = [];
      for (const assignment of assignments) {
        if (
          assignment.targetResourceType !== 'PERSONAL_LEARNING_PLAN' ||
          assignment.targetResourceId !== plan.planId
        )
          continue;
        const metadata = object(object(assignment.displaySnapshot).personalLearning);
        if (
          metadata.planId !== plan.planId ||
          metadata.routerVersion !== AI_TRAINING_LEARNING_ROUTER_VERSION ||
          assignment.ruleVersion !== AI_TRAINING_LEARNING_ROUTER_VERSION
        )
          return stop('UNKNOWN', 'ASSIGNMENT_REFERENCE_UNKNOWN');
        const ref = object(metadata.definition);
        if (
          typeof ref.packageKey !== 'string' ||
          typeof ref.definitionKey !== 'string' ||
          typeof ref.version !== 'string'
        )
          return stop('UNKNOWN', 'ASSIGNMENT_REFERENCE_UNKNOWN');
        const answer = await tx.trainingMissionAnswer.findFirst({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            userId: s.userId,
            missionAssignmentId: assignment.id,
          },
        });
        const audit = answer
          ? await tx.programActionEvent.findFirst({
              where: {
                workspaceId: s.workspaceId,
                groupId: s.groupId,
                programEnrollmentId: s.programEnrollmentId,
                actorUserId: s.userId,
                missionAssignmentId: assignment.id,
                eventType: 'ANSWER_EVALUATED',
                sourceResourceType: 'TRAINING_MISSION_ANSWER',
                sourceResourceId: answer.id,
              },
            })
          : null;
        const evaluation = object(answer?.evaluation);
        const audited = object(audit?.metadata);
        evidence.push({
          definition: {
            packageKey: ref.packageKey,
            definitionKey: ref.definitionKey,
            version: ref.version,
          },
          planRevision: Number(metadata.planRevision),
          assignmentId: assignment.id,
          sequence: assignment.sequence,
          missionKey: assignment.missionDefinitionKey,
          qualityVersion: String(object(assignment.displaySnapshot).qualityVersion),
          assignmentStatus: assignment.status,
          evaluatedAt: answer?.evaluatedAt?.toISOString() ?? null,
          verifiedAssessment:
            answer?.evaluationStatus === 'READY' &&
            !!audit &&
            !!answer.evaluatedAt &&
            answer.evaluatedAt.getTime() >= assignment.presentedAt.getTime() &&
            answer.evaluatedAt.getTime() <= now.getTime() &&
            audit.occurredAt.getTime() === answer.evaluatedAt.getTime() &&
            [
              'result',
              'understanding',
              'skills',
              'evaluatedSkillKeys',
              'evaluationRuleVersion',
            ].every((key) => JSON.stringify(evaluation[key]) === JSON.stringify(audited[key])),
          evaluation: answer?.evaluation ?? null,
        });
      }
      const result = routeAiTrainingLearning({
        plan,
        expectedRevision: input.expectedRevision,
        goalActive: true,
        enrollmentActive: true,
        approvedRefs,
        evidence,
      });
      // A legacy/global review flag has no Definition identity. Do not guess its target or ignore it.
      if (profile.needsReview && ['NEXT', 'PLAN_COMPLETED'].includes(result.status))
        return stop('UNKNOWN', 'REVIEW_EVIDENCE_MISSING');
      if (result.status === 'PLAN_COMPLETED') {
        await tx.programActionEvent.upsert({
          where: {
            workspaceId_groupId_idempotencyKey: {
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              idempotencyKey: `PERSONAL_LEARNING_PLAN_COMPLETED_${plan.planId}_${plan.revision}`,
            },
          },
          create: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            actorUserId: s.userId,
            eventType: 'PERSONAL_LEARNING_PLAN_COMPLETED',
            sourceResourceType: 'PERSONAL_LEARNING_PLAN',
            sourceResourceId: plan.planId,
            idempotencyKey: `PERSONAL_LEARNING_PLAN_COMPLETED_${plan.planId}_${plan.revision}`,
            occurredAt: now,
            metadata: json({
              planId: plan.planId,
              planRevision: plan.revision,
              ruleVersion: result.ruleVersion,
            }),
          },
          update: {},
        });
      }
      if (!result.definition || !['NEXT', 'REVIEW', 'RETRY'].includes(result.status))
        return { result, assignmentId: null };
      // Never overwrite an unfinished legacy or old-revision Assignment.
      if (assignments.some((a) => ['PRESENTED', 'STARTED'].includes(a.status)))
        return stop('BLOCKED', 'EXISTING_ASSIGNMENT_ACTIVE');
      const progress = await tx.programProgressSnapshot.findUnique({
        where: { programEnrollmentId: s.programEnrollmentId },
      });
      if (progress?.stateKey === 'PAUSED') return stop('BLOCKED', 'LEARNING_EXECUTION_PAUSED');
      if (
        progress &&
        (progress.workspaceId !== s.workspaceId ||
          progress.groupId !== s.groupId ||
          progress.programTemplateVersionId !== runtime.program.programTemplateVersionId)
      )
        return stop('BLOCKED', 'PROGRESS_SCOPE_MISMATCH');
      const definition = AI_TRAINING_LEARNING_DEFINITION_FIXTURES.find(
        (d) =>
          learningDefinitionIdentity(d.reference) ===
          learningDefinitionIdentity(result.definition!),
      );
      const mission = runtime.missions.find(
        (m) => m.key === definition?.legacyMissionRef.actionKey,
      );
      if (!definition || !mission) return stop('BLOCKED', 'MISSION_REFERENCE_MISSING');
      const display = renderAiTrainingAction(
        {
          actionKey: mission.key,
          mode: 'WORK',
          reasonCode: result.reason,
          target: null,
          ruleVersion: result.ruleVersion,
          reevaluateAt: null,
        },
        mission,
        {
          difficulty: mission.quality.difficulty,
          reasonCode:
            mission.quality.difficulty === 'EASY' ? 'FOUNDATION_EASY' : 'PRACTICE_STANDARD',
        },
      );
      const sequence = (assignments[0]?.sequence ?? 0) + 1;
      const assignment = await tx.programMissionAssignment.create({
        data: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          programTemplateVersionId: runtime.program.programTemplateVersionId,
          sequence,
          routeKey: mission.routeKey,
          phaseKey: mission.phaseKey,
          missionDefinitionKey: mission.key,
          actionMode: 'WORK',
          reasonCode: result.reason,
          status: 'PRESENTED',
          ruleVersion: result.ruleVersion,
          targetResourceType: 'PERSONAL_LEARNING_PLAN',
          targetResourceId: plan.planId,
          displaySnapshot: json({
            ...display,
            personalLearning: {
              planId: plan.planId,
              planRevision: plan.revision,
              definition: result.definition,
              routerVersion: result.ruleVersion,
            },
          }),
          presentedAt: now,
        },
      });
      await tx.programActionEvent.create({
        data: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          missionAssignmentId: assignment.id,
          eventType: 'PERSONAL_LEARNING_ASSIGNMENT_BRIDGED',
          sourceResourceType: 'PERSONAL_LEARNING_PLAN',
          sourceResourceId: plan.planId,
          idempotencyKey: receiptKey,
          actorUserId: s.userId,
          occurredAt: now,
          metadata: json({ planId: plan.planId, planRevision: plan.revision, result }),
        },
      });
      const snapshot = {
        currentAssignmentId: assignment.id,
        routeKey: mission.routeKey,
        phaseKey: mission.phaseKey,
        stateKey: 'ACTIVE',
        ruleVersion: result.ruleVersion,
        nextEvaluationAt: null,
        calculatedAt: now,
      };
      await tx.programProgressSnapshot.upsert({
        where: { programEnrollmentId: s.programEnrollmentId },
        create: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          programTemplateVersionId: runtime.program.programTemplateVersionId,
          ...snapshot,
        },
        update: { ...snapshot, revision: { increment: 1 } },
      });
      return { result, assignmentId: assignment.id };
    });
  }
}
