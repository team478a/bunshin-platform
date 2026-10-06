import type { PersonalLearningActor } from '@bunshin/application';
import type { Prisma } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import {
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  learningDefinitionIdentity,
} from '@bunshin/capability-training';
import { PrismaPersonalLearningPilotRepository } from './personal-learning-pilot';

function denied(): never {
  throw new ApplicationError('NOT_FOUND', 'learning assessment unavailable');
}

/** Fresh execution authorization, separate from the historical AI-call fact repository. */
export class PrismaPersonalLearningAssessmentGate extends PrismaPersonalLearningPilotRepository {
  authorizeAssessment(actor: PersonalLearningActor, assignmentId: string, answerId: string) {
    return this.authorized(actor, true, (tx) =>
      this.validateAssessment(tx, actor, assignmentId, answerId),
    );
  }

  protected async validateAssessment(
    tx: Prisma.TransactionClient,
    actor: PersonalLearningActor,
    assignmentId: string,
    answerId: string,
  ) {
    const s = actor.scope;
    const assignment = await tx.programMissionAssignment.findFirst({
      where: {
        id: assignmentId,
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        programEnrollmentId: s.programEnrollmentId,
        targetResourceType: 'PERSONAL_LEARNING_PLAN',
        status: { in: ['PRESENTED', 'STARTED'] },
      },
    });
    if (!assignment?.targetResourceId) denied();
    const answer = await tx.trainingMissionAnswer.findFirst({
      where: {
        id: answerId,
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        programEnrollmentId: s.programEnrollmentId,
        missionAssignmentId: assignmentId,
        userId: s.userId,
        evaluationStatus: 'PENDING',
      },
      select: { id: true },
    });
    if (!answer) denied();
    const row = await tx.personalLearningPlanRevision.findFirst({
      where: {
        ...s,
        planId: assignment.targetResourceId,
      },
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
    const snapshot = assignment.displaySnapshot as {
      personalLearning?: {
        planRevision?: number;
        definition?: { packageKey: string; definitionKey: string; version: string };
      };
    };
    const ref = snapshot?.personalLearning?.definition;
    if (!ref || snapshot.personalLearning?.planRevision !== plan.revision) denied();
    const identity = learningDefinitionIdentity(ref);
    const definition = AI_TRAINING_LEARNING_DEFINITION_FIXTURES.find(
      (d) => learningDefinitionIdentity(d.reference) === identity,
    );
    if (
      !definition ||
      definition.legacyMissionRef.actionKey !== assignment.missionDefinitionKey ||
      !plan.steps.some((step) => learningDefinitionIdentity(step.definition) === identity) ||
      !(await this.approved(tx, actor)).some(
        (approved) => learningDefinitionIdentity(approved) === identity,
      )
    )
      denied();
  }
}
