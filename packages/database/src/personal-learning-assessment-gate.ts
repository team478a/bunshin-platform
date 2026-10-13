import {
  PERSONAL_LEARNING_PRACTICE_MISSION,
  PERSONAL_LEARNING_PRACTICE_VERSION,
  LEARNING_CANDIDATE_POLICY,
  parseStoredPersonalLearningEvidenceSubmission,
  validateLearningLessonProposal,
  validatePersonalLearningEvidenceSubmission,
  type PersonalLearningActor,
} from '@bunshin/application';
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
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

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
      select: { id: true, answer: true },
    });
    if (!answer) denied();
    if (assignment.missionDefinitionKey === PERSONAL_LEARNING_PRACTICE_MISSION) {
      try {
        const dynamic = object(object(assignment.displaySnapshot).dynamicPractice);
        const savedScope = object(dynamic.scope);
        const candidate = object(dynamic.candidate);
        const submission = parseStoredPersonalLearningEvidenceSubmission(answer.answer);
        const history = await tx.trainingMissionAnswer.findMany({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            missionAssignmentId: assignment.id,
            userId: s.userId,
          },
          orderBy: { createdAt: 'asc' },
          take: 101,
          select: { id: true, answer: true, evaluationStatus: true },
        });
        const historyWithRevision = history.map((entry) => ({
          entry,
          submission: parseStoredPersonalLearningEvidenceSubmission(entry.answer),
        }));
        historyWithRevision.sort(
          (left, right) => (left.submission?.revision ?? 0) - (right.submission?.revision ?? 0),
        );
        if (
          history.length > 100 ||
          historyWithRevision.at(-1)?.entry.id !== answer.id ||
          historyWithRevision.some(
            ({ entry, submission: prior }, index) =>
              (entry.evaluationStatus === 'PENDING' && entry.id !== answer.id) ||
              prior?.revision !== index + 1 ||
              prior.candidateId !== candidate.id,
          )
        )
          denied();
        if (
          dynamic.version !== PERSONAL_LEARNING_PRACTICE_VERSION ||
          Object.entries(s).some(([key, value]) => savedScope[key] !== value) ||
          candidate.materialVersion !== 1 ||
          candidate.confirmedAt == null ||
          typeof candidate.id !== 'string' ||
          typeof candidate.originalText !== 'string' ||
          !candidate.originalText.trim() ||
          !submission ||
          submission.candidateId !== candidate.id ||
          submission.materialVersion !== candidate.materialVersion
        )
          denied();
        validateLearningLessonProposal(candidate.proposal);
        if (object(candidate.proposal).status !== 'READY') denied();
        validatePersonalLearningEvidenceSubmission({
          kind: submission.kind,
          content: submission.content,
          expectedRevision: submission.revision - 1,
        });
        const goalId = dynamic.goalId;
        const [goal, plan, programs] = await Promise.all([
          tx.programMemberGoal.findFirst({
            where: { id: goalId as string, ...s, status: 'ACTIVE' },
            select: { id: true },
          }),
          tx.personalLearningPlanRevision.findFirst({
            where: {
              ...s,
              planId: assignment.targetResourceId,
              revision: 1,
              status: 'CONFIRMED',
              programMemberGoalId: goalId as string,
            },
            select: { planId: true },
          }),
          tx.serviceProgram.findFirst({
            where: { workspaceId: s.workspaceId, groupId: s.groupId, status: 'ACTIVE' },
            select: { settings: true },
          }),
        ]);
        const policy = object(object(programs?.settings).personalLearningPracticePolicy);
        if (
          !goal ||
          !plan ||
          policy.enabled !== true ||
          policy.version !== LEARNING_CANDIDATE_POLICY ||
          !Number.isSafeInteger(submission.revision) ||
          submission.revision < 1 ||
          submission.revision > 100
        )
          denied();
      } catch {
        denied();
      }
      return;
    }
    const row = await this.executablePlan(tx, actor, assignment.targetResourceId);
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
