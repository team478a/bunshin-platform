import { ApplicationError } from '@bunshin/shared';
import {
  AI_CALL_OBSERVABILITY_VERSION,
  estimateAiCallCost,
  validateAiCallMeasurement,
  type AiCallMeasurement,
  type AiTokenPricing,
  type LearningDefinitionReference,
  type PersonalLearningActor,
} from '@bunshin/application';
import { isPersonalLearningPilotProgram } from '@bunshin/capability-training';
import type { Prisma, PrismaClient } from '@prisma/client';
import { lockTrainingEnrollmentData } from './training-data-lock';

function denied(): never {
  throw new ApplicationError('NOT_FOUND', 'AI call learning scope unavailable');
}
/** Facts only; the existing Plan/Assignment/Answer remain authoritative. */
export class PrismaPersonalLearningAiCallRepository {
  constructor(private readonly client: PrismaClient) {}
  private async context(
    tx: Prisma.TransactionClient,
    actor: PersonalLearningActor,
    assignmentId: string,
    answerId: string,
  ) {
    const s = actor.scope;
    if (actor.actorUserId !== s.userId) denied();
    await lockTrainingEnrollmentData(tx, { ...s, actorUserId: actor.actorUserId });
    const membership = await tx.groupMembership.findFirst({
      where: {
        id: s.groupMembershipId,
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        userId: s.userId,
        status: 'ACTIVE',
        serviceRole: 'PARTICIPANT',
        user: { status: 'ACTIVE' },
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    const enrollment = await tx.programEnrollment.findFirst({
      where: {
        id: s.programEnrollmentId,
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        groupMembershipId: s.groupMembershipId,
      },
      select: { serviceProgramId: true },
    });
    const program = enrollment
      ? await tx.serviceProgram.findFirst({
          where: {
            id: enrollment.serviceProgramId,
            workspaceId: s.workspaceId,
            groupId: s.groupId,
          },
          select: { settings: true },
        })
      : null;
    if (!membership || !enrollment || !program || !isPersonalLearningPilotProgram(program.settings))
      denied();
    const deletion = await tx.programAuditLog.findFirst({
      where: {
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        resourceType: 'PROGRAM_ENROLLMENT',
        resourceId: s.programEnrollmentId,
        action: 'TRAINING_PERSONAL_DATA_DELETED',
        afterData: { path: ['kind'], equals: 'ALL' },
      },
      select: { id: true },
    });
    if (deletion) denied();
    const answer = await tx.trainingMissionAnswer.findFirst({
      where: {
        id: answerId,
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        programEnrollmentId: s.programEnrollmentId,
        missionAssignmentId: assignmentId,
        userId: s.userId,
      },
      select: { id: true },
    });
    const assignment = await tx.programMissionAssignment.findFirst({
      where: {
        id: assignmentId,
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        programEnrollmentId: s.programEnrollmentId,
        targetResourceType: 'PERSONAL_LEARNING_PLAN',
      },
      select: { targetResourceId: true, displaySnapshot: true },
    });
    if (!answer || !assignment?.targetResourceId) denied();
    const snapshot = assignment.displaySnapshot as {
      personalLearning?: { planRevision?: number; definition?: LearningDefinitionReference };
    };
    const revision = snapshot.personalLearning?.planRevision;
    const definition = snapshot.personalLearning?.definition;
    if (!Number.isInteger(revision) || !revision || revision < 1 || !definition) denied();
    const plan = await tx.personalLearningPlanRevision.findFirst({
      where: { planId: assignment.targetResourceId, revision, ...s },
      select: { steps: true },
    });
    const steps = plan?.steps as unknown as
      { definition: LearningDefinitionReference }[] | undefined;
    if (
      !Array.isArray(steps) ||
      !steps.some(
        (step) =>
          step.definition.packageKey === definition.packageKey &&
          step.definition.definitionKey === definition.definitionKey &&
          step.definition.version === definition.version,
      )
    )
      denied();
    return {
      serviceProgramId: enrollment.serviceProgramId,
      planId: assignment.targetResourceId,
      planRevision: revision,
      definition: {
        packageKey: definition.packageKey,
        definitionKey: definition.definitionKey,
        version: definition.version,
      },
    };
  }
  async resolve(actor: PersonalLearningActor, assignmentId: string, answerId: string) {
    return this.client.$transaction((tx) => this.context(tx, actor, assignmentId, answerId), {
      isolationLevel: 'Serializable',
    });
  }
  async record(input: {
    actor: PersonalLearningActor;
    assignmentId: string;
    answerId: string;
    usageKey: string;
    measurement: AiCallMeasurement;
    registry: readonly AiTokenPricing[];
  }) {
    const m = validateAiCallMeasurement(input.measurement);
    if (
      !/^training-evaluation:[0-9a-f-]{36}:[0-9a-f-]{36}:attempt:[1-9][0-9]*$/i.test(
        input.usageKey,
      ) ||
      input.usageKey.split(':')[1] !== input.answerId
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid AI call attempt key');
    const cost = estimateAiCallCost(m, input.registry);
    return this.client.$transaction(
      async (tx) => {
        const context = await this.context(tx, input.actor, input.assignmentId, input.answerId);
        const s = input.actor.scope;
        const key = `personal-learning-ai-call:${input.usageKey}`;
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
            prior.programEnrollmentId !== s.programEnrollmentId ||
            prior.actorUserId !== s.userId ||
            prior.missionAssignmentId !== input.assignmentId ||
            prior.sourceResourceId !== input.answerId ||
            prior.eventType !== 'PERSONAL_LEARNING_AI_CALL'
          )
            throw new ApplicationError('CONFLICT', 'AI call attempt belongs to another scope');
          return;
        }
        await tx.programActionEvent.create({
          data: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            actorUserId: s.userId,
            missionAssignmentId: input.assignmentId,
            eventType: 'PERSONAL_LEARNING_AI_CALL',
            sourceResourceType: 'TRAINING_MISSION_ANSWER',
            sourceResourceId: input.answerId,
            idempotencyKey: key,
            schemaVersion: 1,
            occurredAt: new Date(m.occurredAt),
            metadata: {
              contractVersion: AI_CALL_OBSERVABILITY_VERSION,
              taskType: 'ASSESSMENT',
              usageKey: input.usageKey,
              ...context,
              ...m,
              cost: { ...cost, pricing: cost.pricing ? { ...cost.pricing } : null },
            },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
