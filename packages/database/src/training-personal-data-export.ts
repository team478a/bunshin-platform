import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_EXPORT_MAX_ROWS,
  type TrainingPersonalDataExportRepository,
  type TrainingPersonalDataReadResult,
  type TrainingPersonalDataScope,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';
import { pilotParticipantHash } from './personal-learning-pilot-seat';

const iso = (value: Date | null) => value?.toISOString() ?? null;

export class PrismaTrainingPersonalDataExportRepository implements TrainingPersonalDataExportRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  read(input: TrainingPersonalDataScope): Promise<TrainingPersonalDataReadResult> {
    return this.client.$transaction(
      async (tx): Promise<TrainingPersonalDataReadResult> => {
        const membership = await tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            serviceRole: 'PARTICIPANT',
            status: 'ACTIVE',
            user: { status: 'ACTIVE' },
            group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          },
          select: { id: true },
        });
        if (!membership) return { outcome: 'NOT_FOUND' };
        const enrollment = await tx.programEnrollment.findFirst({
          where: {
            id: input.programEnrollmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: membership.id,
            status: { in: ['ACTIVE', 'COMPLETED', 'EXPIRED'] },
          },
          select: {
            id: true,
            serviceProgramId: true,
            status: true,
            supportMode: true,
            startsAt: true,
            endsAt: true,
            createdAt: true,
          },
        });
        if (!enrollment) return { outcome: 'NOT_FOUND' };
        // Export does not depend on a still-published template or a still-active program.
        const program = await tx.serviceProgram.findFirst({
          where: {
            id: enrollment.serviceProgramId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
          },
          select: { id: true },
        });
        if (!program) return { outcome: 'NOT_FOUND' };
        const scope = {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
        };
        const personal = { ...scope, userId: input.actorUserId };
        const take = TRAINING_EXPORT_MAX_ROWS + 1;
        const orderBy = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
        const [profile, progress, assignments, answers, toolkit, activities] = await Promise.all([
          tx.trainingParticipantProfile.findFirst({
            where: { ...personal, groupMembershipId: membership.id },
            select: {
              role: true,
              aiLevel: true,
              aiUseCases: true,
              workChallenges: true,
              preferredTopics: true,
              workContext: true,
              dailyMinutes: true,
              learningGoalKey: true,
              skillScores: true,
              currentTopic: true,
              needsReview: true,
              recentSuccesses: true,
              recentFailures: true,
              streak: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
          tx.programProgressSnapshot.findFirst({
            where: scope,
            select: {
              phaseKey: true,
              stateKey: true,
              bottleneckKey: true,
              completedMissionCount: true,
              lastActionAt: true,
              calculatedAt: true,
            },
          }),
          tx.programMissionAssignment.findMany({
            where: scope,
            select: {
              id: true,
              sequence: true,
              missionDefinitionKey: true,
              phaseKey: true,
              actionMode: true,
              status: true,
              presentedAt: true,
              startedAt: true,
              completedAt: true,
              skippedAt: true,
            },
            orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
            take,
          }),
          tx.trainingMissionAnswer.findMany({
            where: personal,
            select: {
              id: true,
              missionAssignmentId: true,
              answer: true,
              evaluationStatus: true,
              evaluation: true,
              evaluatedAt: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy,
            take,
          }),
          tx.trainingToolkitItem.findMany({
            where: personal,
            select: {
              id: true,
              missionAssignmentId: true,
              trainingMissionAnswerId: true,
              missionDefinitionKey: true,
              title: true,
              contentSnapshot: true,
              createdAt: true,
            },
            orderBy,
            take,
          }),
          tx.programActionEvent.findMany({
            where: { ...scope, actorUserId: input.actorUserId },
            select: { eventType: true, missionAssignmentId: true, occurredAt: true },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            take,
          }),
        ]);
        const goals = await tx.programMemberGoal.findMany({
          where: { ...scope, groupMembershipId: membership.id },
          select: {
            title: true,
            metricType: true,
            targetValue: true,
            currentValue: true,
            unit: true,
            status: true,
            startsAt: true,
            dueAt: true,
          },
          orderBy,
          take,
        });
        const learningScope = { ...personal, groupMembershipId: membership.id };
        const [learningGoals, learningPlans, pilotSeats] = await Promise.all([
          tx.personalLearningGoalConfirmation.findMany({ where: learningScope, take }),
          tx.personalLearningPlanRevision.findMany({
            where: learningScope,
            take,
            orderBy: [{ planId: 'asc' }, { revision: 'asc' }],
          }),
          tx.personalLearningPilotSeat.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              serviceProgramId: enrollment.serviceProgramId,
              participantHash: pilotParticipantHash(enrollment.serviceProgramId, input.actorUserId),
            },
            select: {
              kind: true,
              cohort: true,
              seatNumber: true,
              admittedAt: true,
              revokedAt: true,
            },
            take,
          }),
        ]);
        if (
          [assignments, answers, toolkit, activities, goals, learningGoals, learningPlans].some(
            (rows) => rows.length > TRAINING_EXPORT_MAX_ROWS,
          )
        )
          return { outcome: 'TOO_LARGE' };
        return {
          outcome: 'FOUND',
          data: {
            ...(learningGoals.length + learningPlans.length + pilotSeats.length > 0
              ? {
                  personalLearning: [
                    ...pilotSeats.map((row) => ({
                      ...row,
                      kind: 'PILOT_SEAT',
                      participantKind: row.kind,
                      admittedAt: iso(row.admittedAt),
                      revokedAt: iso(row.revokedAt),
                    })),
                    ...learningGoals.map((row) => ({
                      ...row,
                      kind: 'GOAL_CONFIRMATION',
                      confirmedAt: iso(row.confirmedAt),
                    })),
                    ...learningPlans.map((row) => ({
                      ...row,
                      kind: 'PLAN_REVISION',
                      confirmedAt: iso(row.confirmedAt),
                      createdAt: iso(row.createdAt),
                      updatedAt: iso(row.updatedAt),
                    })),
                  ],
                }
              : {}),
            enrollment: {
              id: enrollment.id,
              status: enrollment.status,
              supportMode: enrollment.supportMode,
              startsAt: iso(enrollment.startsAt),
              endsAt: iso(enrollment.endsAt),
              createdAt: iso(enrollment.createdAt),
            },
            profile: profile
              ? { ...profile, createdAt: iso(profile.createdAt), updatedAt: iso(profile.updatedAt) }
              : null,
            progress: progress
              ? {
                  ...progress,
                  lastActionAt: iso(progress.lastActionAt),
                  calculatedAt: iso(progress.calculatedAt),
                }
              : null,
            assignments: assignments.map((row) => ({
              ...row,
              presentedAt: iso(row.presentedAt),
              startedAt: iso(row.startedAt),
              completedAt: iso(row.completedAt),
              skippedAt: iso(row.skippedAt),
            })),
            answers: answers.map((row) => ({
              ...row,
              evaluatedAt: iso(row.evaluatedAt),
              createdAt: iso(row.createdAt),
              updatedAt: iso(row.updatedAt),
            })),
            toolkit: toolkit.map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
            activities: activities.map((row) => ({ ...row, occurredAt: iso(row.occurredAt) })),
            goals: goals.map((row) => ({
              ...row,
              targetValue: row.targetValue.toString(),
              currentValue: row.currentValue.toString(),
              startsAt: iso(row.startsAt),
              dueAt: iso(row.dueAt),
            })),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
