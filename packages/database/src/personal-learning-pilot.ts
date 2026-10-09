import type { Prisma } from '@prisma/client';
import type {
  PersonalLearningActor,
  LearningConsultationRequest,
  LearningDefinitionReference,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import {
  consultAiTrainingLearning,
  projectAiTrainingLearnerProfiles,
  personalLearningPilotAllows,
  parseAiTrainingActionDisplay,
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
} from '@bunshin/capability-training';
import { PrismaPersonalLearningPersistenceRepository } from './personal-learning-persistence';
import { PrismaPersonalLearningRouterBridge } from './personal-learning-router';
import { requirePersonalLearningPilotSeat } from './personal-learning-pilot-seat';

type Tx = Prisma.TransactionClient;
async function requirePilot(tx: Tx, input: PersonalLearningActor) {
  const s = input.scope;
  const programs = await tx.$queryRaw<{ settings: unknown }[]>`
    SELECT p.settings FROM service_programs p JOIN program_enrollments e
      ON e.service_program_id=p.id AND e.workspace_id=p.workspace_id AND e.group_id=p.group_id
    WHERE e.id=${s.programEnrollmentId}::uuid AND e.workspace_id=${s.workspaceId}::uuid
      AND e.group_id=${s.groupId}::uuid AND e.group_membership_id=${s.groupMembershipId}::uuid
    FOR SHARE OF p`;
  if (
    programs.length !== 1 ||
    !personalLearningPilotAllows(programs[0]?.settings, s.programEnrollmentId)
  )
    throw new ApplicationError('NOT_FOUND', 'personal learning pilot unavailable');
  await requirePersonalLearningPilotSeat(tx, s);
}

/** HTTP composition uses this gated subclass, never an ungated persistence port. */
export class PrismaPersonalLearningPilotRepository extends PrismaPersonalLearningPersistenceRepository {
  authorizeAccess(input: PersonalLearningActor, requireSeat = false) {
    return this.authorized(input, false, async (tx) => {
      await requirePersonalLearningPilotSeat(tx, input.scope, requireSeat);
      return true;
    });
  }
  protected override authorized<T>(
    input: PersonalLearningActor,
    write: boolean,
    work: (tx: Tx, now: Date) => Promise<T>,
  ) {
    return super.authorized(input, write, async (tx, now) => {
      await requirePilot(tx, input);
      return work(tx, now);
    });
  }
  consult(
    input: PersonalLearningActor & {
      consultation: LearningConsultationRequest;
      telemetryKey?: string;
    },
  ) {
    return this.authorized(input, true, async (tx) => {
      const s = input.scope;
      const profile = await tx.trainingParticipantProfile.findFirst({ where: { ...s } });
      const goals = await tx.programMemberGoal.findMany({
        where: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          groupMembershipId: s.groupMembershipId,
        },
      });
      const projections = projectAiTrainingLearnerProfiles({ scope: s, profile, goals });
      const result = consultAiTrainingLearning(
        { ...projections, scope: s, approvedDefinitionRefs: await this.approved(tx, input) },
        input.consultation,
      );
      if (input.telemetryKey) {
        if (!/^[0-9a-f-]{36}$/i.test(input.telemetryKey))
          throw new ApplicationError('VALIDATION_ERROR', 'invalid pilot event key');
        const idempotencyKey = `PERSONAL_LEARNING_PILOT_CONSULT_${input.telemetryKey}`;
        const prior = await tx.programActionEvent.findUnique({
          where: {
            workspaceId_groupId_idempotencyKey: {
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              idempotencyKey,
            },
          },
        });
        if (
          prior &&
          (prior.actorUserId !== s.userId || prior.programEnrollmentId !== s.programEnrollmentId)
        )
          throw new ApplicationError('CONFLICT', 'pilot event conflict');
        if (!prior)
          await tx.programActionEvent.create({
            data: {
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              programEnrollmentId: s.programEnrollmentId,
              actorUserId: s.userId,
              eventType: 'PERSONAL_LEARNING_PILOT_CONSULTATION',
              idempotencyKey,
              metadata: { status: result.status, questionCount: result.questionCount },
              occurredAt: new Date(),
            },
          });
      }
      return result;
    });
  }
  readiness(input: PersonalLearningActor) {
    return this.authorized(input, true, async (tx) => ({
      profileReady: !!(await tx.trainingParticipantProfile.findFirst({
        where: { ...input.scope },
        select: { id: true },
      })),
      approvalReady: (await this.approved(tx, input)).length === 3,
    }));
  }
  currentAssignment(input: PersonalLearningActor & { planId: string; revision: number }) {
    return this.authorized(input, true, async (tx) => {
      const s = input.scope;
      const row = await tx.programMissionAssignment.findFirst({
        where: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          targetResourceType: 'PERSONAL_LEARNING_PLAN',
          targetResourceId: input.planId,
        },
        orderBy: { sequence: 'desc' },
      });
      if (!row) return null;
      const snapshot = row.displaySnapshot as {
        qualityVersion?: string;
        personalLearning?: {
          planRevision?: number;
          definition?: Partial<LearningDefinitionReference>;
        };
      };
      if (snapshot.personalLearning?.planRevision !== input.revision) return null;
      const display = parseAiTrainingActionDisplay(row.displaySnapshot);
      if (!display) throw new ApplicationError('CONFLICT', 'pilot assignment display unavailable');
      // Expose only a known, version-pinned presentation reference. Do not infer a version
      // from definitionKey or parseAiTrainingActionDisplay's legacy quality fallback.
      const ref = snapshot.personalLearning?.definition;
      const definition = AI_TRAINING_LEARNING_DEFINITION_FIXTURES.find(
        (d) =>
          d.reference.packageKey === ref?.packageKey &&
          d.reference.definitionKey === ref.definitionKey &&
          d.reference.version === ref.version &&
          d.legacyMissionRef.actionKey === row.missionDefinitionKey &&
          d.legacyMissionRef.qualityVersion === snapshot.qualityVersion,
      );
      const answer = await tx.trainingMissionAnswer.findFirst({
        where: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          missionAssignmentId: row.id,
          userId: s.userId,
        },
        select: { id: true, evaluationStatus: true },
      });
      const completion = await tx.programActionEvent.findFirst({
        where: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          actorUserId: s.userId,
          eventType: 'PERSONAL_LEARNING_PLAN_COMPLETED',
          sourceResourceType: 'PERSONAL_LEARNING_PLAN',
          sourceResourceId: input.planId,
          metadata: { path: ['planRevision'], equals: input.revision },
        },
        select: { id: true },
      });
      return {
        planCompleted: completion !== null,
        definitionKey: snapshot.personalLearning?.definition?.definitionKey ?? null,
        definitionReference: definition?.reference ?? null,
        id: row.id,
        sequence: row.sequence,
        actionKey: row.missionDefinitionKey,
        mode: row.actionMode,
        status: row.status,
        display,
        reevaluateAt: row.reevaluateAt?.toISOString() ?? null,
        submission: answer
          ? { answerId: answer.id, evaluationStatus: answer.evaluationStatus }
          : null,
      };
    });
  }
  feedback(
    input: PersonalLearningActor & { assignmentId: string; fit: 'FIT' | 'NEUTRAL' | 'NOT_FIT' },
  ) {
    return this.authorized(input, true, async (tx, now) => {
      const s = input.scope;
      if (!['FIT', 'NEUTRAL', 'NOT_FIT'].includes(input.fit))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback');
      const assignment = await tx.programMissionAssignment.findFirst({
        where: {
          id: input.assignmentId,
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          targetResourceType: 'PERSONAL_LEARNING_PLAN',
          status: { in: ['COMPLETED', 'SKIPPED'] },
        },
      });
      if (!assignment) throw new ApplicationError('NOT_FOUND', 'pilot assignment unavailable');
      const key = `PERSONAL_LEARNING_FIT_${assignment.id}`;
      const prior = await tx.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            idempotencyKey: key,
          },
        },
      });
      if (prior) return { saved: true };
      await tx.programActionEvent.create({
        data: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          missionAssignmentId: assignment.id,
          actorUserId: s.userId,
          eventType: 'PERSONAL_LEARNING_PILOT_FIT',
          idempotencyKey: key,
          metadata: { fit: input.fit },
          occurredAt: now,
        },
      });
      return { saved: true };
    });
  }
}

export class PrismaPersonalLearningPilotRouter extends PrismaPersonalLearningRouterBridge {
  protected override authorized<T>(
    input: PersonalLearningActor,
    write: boolean,
    work: (tx: Tx, now: Date) => Promise<T>,
  ) {
    return super.authorized(input, write, async (tx, now) => {
      await requirePilot(tx, input);
      return work(tx, now);
    });
  }
}
