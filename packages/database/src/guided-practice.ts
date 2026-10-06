import type { Prisma } from '@prisma/client';
import type { PersonalLearningActor } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import {
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  AI_TRAINING_SKILL_RULE_VERSION,
  GUIDED_PRACTICE_RULE_VERSION,
  CAPABILITY_INTERACTIONS,
  definePracticeCompletion,
  effectivePracticeSupport,
  learningDefinitionIdentity,
  validateGuidedPracticeCommand,
  type GuidedPracticeCommand,
  type GuidedPracticeReference,
  type GuidedPracticeView,
  type PracticeSupportLevel,
} from '@bunshin/capability-training';
import { PrismaPersonalLearningPilotRepository } from './personal-learning-pilot';
type Tx = Prisma.TransactionClient;
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
function denied(): never {
  throw new ApplicationError('NOT_FOUND', 'practice unavailable');
}
function conflict(): never {
  throw new ApplicationError('CONFLICT', 'practice evidence required');
}
const eventTypes = {
  START: 'PERSONAL_LEARNING_PRACTICE_STARTED',
  INTERACT: 'PERSONAL_LEARNING_CAPABILITY_INTERACTION',
  COMPLETE: 'PERSONAL_LEARNING_PRACTICE_COMPLETED',
} as const;

/** Append-only facts. Not a second Assignment/Progress/Goal authority. */
export class PrismaGuidedPracticeRepository extends PrismaPersonalLearningPilotRepository {
  private events(tx: Tx, actor: PersonalLearningActor, assignmentId?: string) {
    const s = actor.scope;
    return tx.programActionEvent.findMany({
      where: {
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        programEnrollmentId: s.programEnrollmentId,
        actorUserId: s.userId,
        ...(assignmentId ? { missionAssignmentId: assignmentId } : {}),
        eventType: { in: [...Object.values(eventTypes), 'PERSONAL_LEARNING_FIRST_SUCCESS'] },
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  }
  readPractice(
    actor: PersonalLearningActor,
    assignmentId: string | null,
  ): Promise<GuidedPracticeView> {
    return this.authorized(actor, false, async (tx) => {
      const rows = await this.events(tx, actor);
      const current = rows.filter((r) => r.missionAssignmentId === assignmentId);
      const start = current.find((r) => r.eventType === eventTypes.START);
      const completion = current.find((r) => r.eventType === eventTypes.COMPLETE);
      const support = object(completion?.metadata ?? start?.metadata).supportLevel;
      return {
        started: !!start,
        completed: current.some((r) => r.eventType === eventTypes.COMPLETE),
        supportLevel: ['GUIDED', 'HINTED', 'INDEPENDENT'].includes(String(support))
          ? (support as PracticeSupportLevel)
          : null,
        interactions: CAPABILITY_INTERACTIONS.filter((k) =>
          current.some(
            (r) => r.eventType === eventTypes.INTERACT && object(r.metadata).interaction === k,
          ),
        ),
        firstSuccess: rows.some((r) => r.eventType === 'PERSONAL_LEARNING_FIRST_SUCCESS'),
      };
    });
  }
  recordPractice(actor: PersonalLearningActor, assignmentId: string, raw: GuidedPracticeCommand) {
    let command: GuidedPracticeCommand;
    try {
      command = validateGuidedPracticeCommand(raw);
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid practice command');
    }
    return this.authorized(actor, true, async (tx, now) => {
      const s = actor.scope;
      const assignment = await tx.programMissionAssignment.findFirst({
        where: {
          id: assignmentId,
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          targetResourceType: 'PERSONAL_LEARNING_PLAN',
          status: { in: ['PRESENTED', 'STARTED', 'COMPLETED'] },
        },
      });
      if (!assignment?.targetResourceId) denied();
      const row = await tx.personalLearningPlanRevision.findFirst({
        where: { ...s, planId: assignment.targetResourceId },
        orderBy: { revision: 'desc' },
        include: { goalConfirmation: { include: { goal: true } } },
      });
      if (!row || row.status !== 'CONFIRMED' || row.goalConfirmation.goal.status !== 'ACTIVE')
        denied();
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
        denied();
      const plan = this.restore(row);
      const snapshot = object(assignment.displaySnapshot);
      const personal = object(snapshot.personalLearning);
      const d = object(personal.definition);
      const definition = AI_TRAINING_LEARNING_DEFINITION_FIXTURES.find(
        (f) =>
          f.reference.packageKey === d.packageKey &&
          f.reference.definitionKey === d.definitionKey &&
          f.reference.version === d.version,
      );
      if (
        !definition ||
        personal.planId !== plan.planId ||
        personal.planRevision !== plan.revision ||
        assignment.missionDefinitionKey !== definition.legacyMissionRef.actionKey ||
        snapshot.qualityVersion !== definition.legacyMissionRef.qualityVersion ||
        !plan.steps.some(
          (step) =>
            learningDefinitionIdentity(step.definition) ===
            learningDefinitionIdentity(definition.reference),
        ) ||
        !(await this.approved(tx, actor)).some(
          (ref) =>
            learningDefinitionIdentity(ref) === learningDefinitionIdentity(definition.reference),
        )
      )
        denied();
      const ref: GuidedPracticeReference = {
        goalId: row.programMemberGoalId,
        planId: plan.planId,
        planRevision: plan.revision,
        definition: definition.reference,
        assignmentId,
      };
      const rows = await this.events(tx, actor, assignmentId);
      const start = rows.find((r) => r.eventType === eventTypes.START);
      const complete = rows.find((r) => r.eventType === eventTypes.COMPLETE);
      const key = `PERSONAL_LEARNING_PRACTICE_${assignmentId}_${command.action}${command.action === 'INTERACT' ? `_${command.interaction}` : ''}`;
      const prior = await tx.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            idempotencyKey: key,
          },
        },
      });
      if (prior) {
        if (
          prior.actorUserId !== s.userId ||
          prior.programEnrollmentId !== s.programEnrollmentId ||
          prior.missionAssignmentId !== assignmentId ||
          prior.eventType !== eventTypes[command.action] ||
          Object.keys(object(object(prior.metadata).command)).length !==
            Object.keys(command).length ||
          Object.entries(command).some(([k, v]) => object(object(prior.metadata).command)[k] !== v)
        )
          conflict();
        return { saved: true, replayed: true };
      }
      if (complete || (command.action !== 'START' && !start)) conflict();
      const metadata: Record<string, unknown> = {
        ruleVersion: GUIDED_PRACTICE_RULE_VERSION,
        ...ref,
        command,
        operator: 'LEARNER',
        provenance: 'LEARNER_REPORTED',
      };
      if (command.action === 'START') metadata.supportLevel = command.supportLevel;
      if (command.action === 'INTERACT') {
        if (
          command.interaction !== 'SELF_PROMPTED' &&
          !rows.some((r) => object(r.metadata).interaction === 'SELF_PROMPTED')
        )
          conflict();
        if (
          command.interaction === 'SELF_REVISED' &&
          !rows.some((r) => object(r.metadata).interaction === 'SELF_EVALUATED')
        )
          conflict();
        metadata.interaction = command.interaction;
      }
      if (command.action === 'COMPLETE') {
        const answer = await tx.trainingMissionAnswer.findFirst({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            userId: s.userId,
            missionAssignmentId: assignmentId,
            evaluationStatus: 'READY',
          },
        });
        const audit =
          answer &&
          (await tx.programActionEvent.findFirst({
            where: {
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              programEnrollmentId: s.programEnrollmentId,
              actorUserId: s.userId,
              missionAssignmentId: assignmentId,
              eventType: 'ANSWER_EVALUATED',
              sourceResourceType: 'TRAINING_MISSION_ANSWER',
              sourceResourceId: answer.id,
            },
          }));
        const evaluation = object(answer?.evaluation),
          audited = object(audit?.metadata),
          skills = object(evaluation.skills);
        const verified =
          !!answer &&
          !!audit &&
          !!answer.evaluatedAt &&
          assignment.status === 'COMPLETED' &&
          answer.evaluatedAt.getTime() >= assignment.presentedAt.getTime() &&
          answer.evaluatedAt.getTime() <= now.getTime() &&
          audit.occurredAt.getTime() === answer.evaluatedAt.getTime() &&
          evaluation.result === 'PASS' &&
          evaluation.evaluationRuleVersion === AI_TRAINING_SKILL_RULE_VERSION &&
          typeof evaluation.understanding === 'number' &&
          evaluation.understanding >= 60 &&
          evaluation.understanding <= 100 &&
          definition.targetSkillRefs.every(
            (skill) =>
              Array.isArray(evaluation.evaluatedSkillKeys) &&
              evaluation.evaluatedSkillKeys.includes(skill.skillKey) &&
              typeof skills[skill.skillKey] === 'number' &&
              Number(skills[skill.skillKey]) >= 60 &&
              Number(skills[skill.skillKey]) <= 100,
          ) &&
          [
            'result',
            'understanding',
            'skills',
            'evaluatedSkillKeys',
            'evaluationRuleVersion',
          ].every((k) => JSON.stringify(evaluation[k]) === JSON.stringify(audited[k]));
        const supportEvents = await tx.programActionEvent.findMany({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            actorUserId: s.userId,
            missionAssignmentId: assignmentId,
            eventType: { in: ['HINT_VIEWED', 'HELP_REQUESTED'] },
          },
          select: { eventType: true },
        });
        const support = effectivePracticeSupport(
          object(start?.metadata).supportLevel as PracticeSupportLevel,
          supportEvents.some((e) => e.eventType === 'HINT_VIEWED'),
          supportEvents.some((e) => e.eventType === 'HELP_REQUESTED'),
        );
        try {
          Object.assign(
            metadata,
            definePracticeCompletion({
              command,
              started: !!start,
              interactions: CAPABILITY_INTERACTIONS.filter((k) =>
                rows.some(
                  (r) =>
                    r.eventType === eventTypes.INTERACT && object(r.metadata).interaction === k,
                ),
              ),
              assessmentVerified: verified,
              supportLevel: support,
            }),
          );
        } catch {
          conflict();
        }
        metadata.assessment = { answerId: answer!.id, ruleVersion: AI_TRAINING_SKILL_RULE_VERSION };
      }
      const data = {
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        programEnrollmentId: s.programEnrollmentId,
        actorUserId: s.userId,
        missionAssignmentId: assignmentId,
        sourceResourceType: 'PERSONAL_LEARNING_PLAN',
        sourceResourceId: ref.planId,
        occurredAt: now,
        schemaVersion: 1,
      };
      if (command.action === 'COMPLETE') {
        data.sourceResourceType = 'TRAINING_MISSION_ANSWER';
        data.sourceResourceId = String(object(metadata.assessment).answerId);
      }
      await tx.programActionEvent.create({
        data: {
          ...data,
          eventType: eventTypes[command.action],
          idempotencyKey: key,
          metadata: metadata as Prisma.InputJsonObject,
        },
      });
      if (command.action === 'COMPLETE') {
        const firstKey = `PERSONAL_LEARNING_FIRST_SUCCESS_${s.programEnrollmentId}`;
        const first = await tx.programActionEvent.findUnique({
          where: {
            workspaceId_groupId_idempotencyKey: {
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              idempotencyKey: firstKey,
            },
          },
        });
        const deletedHistory = await tx.programAuditLog.findFirst({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            resourceType: 'PROGRAM_ENROLLMENT',
            resourceId: s.programEnrollmentId,
            action: 'TRAINING_PERSONAL_DATA_DELETED',
          },
        });
        if (!first && !deletedHistory) {
          const starts = (await this.events(tx, actor)).filter(
            (r) => r.eventType === eventTypes.START,
          );
          await tx.programActionEvent.create({
            data: {
              ...data,
              eventType: 'PERSONAL_LEARNING_FIRST_SUCCESS',
              idempotencyKey: firstKey,
              metadata: {
                ...metadata,
                achievedAt: now.toISOString(),
                startedAt: starts[0]!.occurredAt.toISOString(),
                practiceSessionsToFirstSuccess: starts.length,
              } as Prisma.InputJsonObject,
            },
          });
        }
      }
      return { saved: true, replayed: false };
    });
  }
}
