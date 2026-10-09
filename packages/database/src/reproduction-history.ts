import {
  AI_TRAINING_V1_MODULE_KEY,
  isPersonalLearningPilotProgram,
  projectLearningReproductionHistory,
  REPRODUCTION_HISTORY_MAX_EVENTS,
  type ReproductionHistoryRepository,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';
import { trainingPersonalDataRoleAllows } from './training-personal-data-privacy';

const iso = (date: Date | null) => date?.toISOString() ?? null;
const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Owner-only Privacy read. No live Pilot gate, Provider, writes or automatic pair selection. */
export class PrismaReproductionHistoryRepository implements ReproductionHistoryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  read(
    input: Parameters<ReproductionHistoryRepository['read']>[0],
  ): ReturnType<ReproductionHistoryRepository['read']> {
    if (
      ![
        input.workspaceId,
        input.groupId,
        input.actorUserId,
        input.programEnrollmentId,
        input.baselineAssignmentId,
        input.followUpAssignmentId,
      ].every(uuid)
    )
      return Promise.resolve({ outcome: 'NOT_FOUND' });
    return this.client.$transaction(
      async (tx) => {
        const membership = await tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            serviceRole: { in: ['PARTICIPANT', 'SERVICE_OWNER'] },
            status: 'ACTIVE',
            user: { status: 'ACTIVE' },
            group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          },
          select: { id: true, serviceRole: true },
        });
        if (!membership) return { outcome: 'NOT_FOUND' } as const;
        const enrollment = await tx.programEnrollment.findFirst({
          where: {
            id: input.programEnrollmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: membership.id,
            status: { in: ['ACTIVE', 'COMPLETED', 'EXPIRED'] },
          },
          select: { id: true, serviceProgramId: true },
        });
        if (!enrollment) return { outcome: 'NOT_FOUND' } as const;
        const program = await tx.serviceProgram.findFirst({
          where: {
            id: enrollment.serviceProgramId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
          },
          select: { id: true, settings: true },
        });
        if (
          !program ||
          !isPersonalLearningPilotProgram(program.settings) ||
          !(await trainingPersonalDataRoleAllows(tx, input, membership.serviceRole, program))
        )
          return { outcome: 'NOT_FOUND' } as const;
        const scope = {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
        };
        const ids = [...new Set([input.baselineAssignmentId, input.followUpAssignmentId])];
        const [assignments, answers, events] = await Promise.all([
          tx.programMissionAssignment.findMany({
            where: { ...scope, id: { in: ids } },
            take: 3,
            select: {
              id: true,
              workspaceId: true,
              groupId: true,
              programEnrollmentId: true,
              status: true,
              targetResourceType: true,
              targetResourceId: true,
              missionDefinitionKey: true,
              presentedAt: true,
              completedAt: true,
              displaySnapshot: true,
            },
          }),
          tx.trainingMissionAnswer.findMany({
            where: { ...scope, userId: input.actorUserId, missionAssignmentId: { in: ids } },
            take: 3,
            select: {
              id: true,
              workspaceId: true,
              groupId: true,
              programEnrollmentId: true,
              userId: true,
              missionAssignmentId: true,
              evaluationStatus: true,
              evaluatedAt: true,
              evaluation: true,
            },
          }),
          tx.programActionEvent.findMany({
            where: {
              ...scope,
              actorUserId: input.actorUserId,
              missionAssignmentId: { in: ids },
              eventType: {
                in: [
                  'PERSONAL_LEARNING_PRACTICE_STARTED',
                  'PERSONAL_LEARNING_CAPABILITY_INTERACTION',
                  'PERSONAL_LEARNING_PRACTICE_COMPLETED',
                  'ANSWER_EVALUATED',
                  'HINT_VIEWED',
                  'HELP_REQUESTED',
                ],
              },
            },
            select: {
              id: true,
              workspaceId: true,
              groupId: true,
              programEnrollmentId: true,
              actorUserId: true,
              missionAssignmentId: true,
              eventType: true,
              schemaVersion: true,
              sourceResourceType: true,
              sourceResourceId: true,
              occurredAt: true,
              metadata: true,
            },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            take: REPRODUCTION_HISTORY_MAX_EVENTS + 1,
          }),
        ]);
        // Exact historical revisions only. Do not replace old evidence with the current/best Plan.
        const refs = assignments.flatMap((row) => {
          const snapshot = row.displaySnapshot as Record<string, unknown> | null;
          const value = snapshot?.['personalLearning'] as Record<string, unknown> | null;
          return value &&
            typeof value['planId'] === 'string' &&
            uuid(value['planId']) &&
            Number.isSafeInteger(value['planRevision']) &&
            Number(value['planRevision']) > 0
            ? [{ planId: value['planId'], revision: Number(value['planRevision']) }]
            : [];
        });
        const learnerScope = {
          ...scope,
          groupMembershipId: membership.id,
          userId: input.actorUserId,
        };
        const plans =
          refs.length === 0
            ? []
            : await tx.personalLearningPlanRevision.findMany({
                where: { ...learnerScope, OR: refs },
                take: 3,
                select: {
                  planId: true,
                  revision: true,
                  programMemberGoalId: true,
                  contractVersion: true,
                  ruleVersion: true,
                  status: true,
                  confirmedAt: true,
                  steps: true,
                  workspaceId: true,
                  groupId: true,
                  programEnrollmentId: true,
                  groupMembershipId: true,
                  userId: true,
                },
              });
        return {
          outcome: 'FOUND',
          data: projectLearningReproductionHistory({
            scope: learnerScope,
            baselineAssignmentId: input.baselineAssignmentId,
            followUpAssignmentId: input.followUpAssignmentId,
            truncated:
              events.length > REPRODUCTION_HISTORY_MAX_EVENTS ||
              assignments.length > 2 ||
              answers.length > 2 ||
              plans.length > 2,
            assignments: assignments.map((row) => ({
              ...row,
              presentedAt: row.presentedAt.toISOString(),
              completedAt: iso(row.completedAt),
            })),
            answers: answers.map((row) => ({ ...row, evaluatedAt: iso(row.evaluatedAt) })),
            events: events.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() })),
            plans: plans.map((row) => ({
              scope: {
                workspaceId: row.workspaceId,
                groupId: row.groupId,
                programEnrollmentId: row.programEnrollmentId,
                groupMembershipId: row.groupMembershipId,
                userId: row.userId,
              },
              planId: row.planId,
              revision: row.revision,
              goalId: row.programMemberGoalId,
              contractVersion: row.contractVersion,
              ruleVersion: row.ruleVersion,
              status: row.status,
              confirmedAt: iso(row.confirmedAt),
              steps: row.steps,
            })),
          }),
        } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
