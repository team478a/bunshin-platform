import {
  AI_RESALE_V1_MODULE_KEY,
  parseAiResaleActionDisplaySnapshot,
  parseAiResaleRuntimeSettings,
  programDayAt,
  type AiResaleActionResultInput,
  type AiResaleParticipantAction,
  type AiResaleParticipantRepository,
  type AiResaleParticipantState,
  type AiResaleRuntimeSettings,
} from '@bunshin/capability-resale';
import { Prisma, type PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;
type ParticipantScope = {
  enrollment: Prisma.ProgramEnrollmentGetPayload<object>;
  membership: Prisma.GroupMembershipGetPayload<object>;
  program: Prisma.ServiceProgramGetPayload<object>;
  settings: AiResaleRuntimeSettings;
};

async function participantScope(
  db: Db,
  input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
  },
  statuses: Array<'ACTIVE' | 'COMPLETED' | 'EXPIRED'>,
): Promise<ParticipantScope | null> {
  const enrollment = await db.programEnrollment.findFirst({
    where: {
      id: input.programEnrollmentId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: { in: statuses },
      startsAt: { not: null },
    },
  });
  if (!enrollment?.startsAt) return null;
  const [membership, program] = await Promise.all([
    db.groupMembership.findFirst({
      where: {
        id: enrollment.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
    }),
    db.serviceProgram.findFirst({
      where: {
        id: enrollment.serviceProgramId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        settings: { path: ['moduleKey'], equals: AI_RESALE_V1_MODULE_KEY },
      },
    }),
  ]);
  if (!membership || !program) return null;
  try {
    const settings = parseAiResaleRuntimeSettings(program.settings);
    return settings === null ? null : { enrollment, membership, program, settings };
  } catch {
    return null;
  }
}

function participantAction(row: {
  id: string;
  sequence: number;
  missionDefinitionKey: string;
  actionMode: 'WORK' | 'WAIT';
  status: 'PRESENTED' | 'STARTED' | 'COMPLETED' | 'SKIPPED';
  displaySnapshot: unknown;
  targetResourceId: string | null;
  presentedAt: Date;
  reevaluateAt: Date | null;
}): AiResaleParticipantAction | null {
  const display = parseAiResaleActionDisplaySnapshot(row.displaySnapshot);
  if (
    !display ||
    display.actionKey !== row.missionDefinitionKey ||
    display.mode !== row.actionMode
  ) {
    return null;
  }
  return {
    id: row.id,
    sequence: row.sequence,
    actionKey: display.actionKey,
    mode: row.actionMode,
    status: row.status,
    display,
    targetResourceId: row.targetResourceId,
    presentedAt: row.presentedAt,
    reevaluateAt: row.reevaluateAt,
  };
}

const resultEventType = (status: AiResaleActionResultInput['resultStatus']) =>
  status === 'DONE'
    ? 'ACTION_COMPLETED'
    : status === 'PARTIAL'
      ? 'ACTION_PARTIAL'
      : 'ACTION_NOT_COMPLETED';

const plusHours = (value: Date, hours: number) =>
  new Date(value.getTime() + hours * 60 * 60 * 1000);

export class PrismaAiResaleParticipantRepository implements AiResaleParticipantRepository {
  constructor(private readonly client: PrismaClient) {}

  async findState(input: Parameters<AiResaleParticipantRepository['findState']>[0]) {
    const scope = await participantScope(this.client, input, ['ACTIVE', 'COMPLETED', 'EXPIRED']);
    if (!scope) return null;
    const progress = await this.client.programProgressSnapshot.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: scope.enrollment.id,
      },
    });
    const assignment = progress?.currentAssignmentId
      ? await this.client.programMissionAssignment.findFirst({
          where: {
            id: progress.currentAssignmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: scope.enrollment.id,
            status: { in: ['PRESENTED', 'STARTED'] },
          },
        })
      : null;
    const classification = ['NOT_STARTED', 'PARTIAL', 'LISTED'].includes(
      progress?.bottleneckKey ?? '',
    )
      ? (progress!.bottleneckKey as AiResaleParticipantState['classification'])
      : null;
    return {
      enrollmentId: scope.enrollment.id,
      programName: scope.program.displayName,
      enrollmentStatus: scope.enrollment.status as AiResaleParticipantState['enrollmentStatus'],
      policyKey: scope.settings.policyKey,
      programDay: programDayAt({
        startsAt: scope.enrollment.startsAt!,
        now: input.now,
        timeZone: scope.settings.timeZone,
      }),
      startsAt: scope.enrollment.startsAt!,
      endsAt: scope.enrollment.endsAt,
      classification,
      action: assignment ? participantAction(assignment) : null,
    };
  }

  async findAction(input: Parameters<AiResaleParticipantRepository['findAction']>[0]) {
    const scope = await participantScope(this.client, input, ['ACTIVE']);
    if (!scope) return null;
    const assignment = await this.client.programMissionAssignment.findFirst({
      where: {
        id: input.assignmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: scope.enrollment.id,
      },
    });
    return assignment ? participantAction(assignment) : null;
  }

  async applyResult(input: AiResaleActionResultInput) {
    const eventType = resultEventType(input.resultStatus);
    const eventKey = `ai-resale:result:${input.idempotencyKey}`;
    const existing = await this.client.programActionEvent.findUnique({
      where: {
        workspaceId_groupId_idempotencyKey: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          idempotencyKey: eventKey,
        },
      },
    });
    if (existing) {
      return existing.programEnrollmentId === input.programEnrollmentId &&
        existing.missionAssignmentId === input.assignmentId &&
        existing.eventType === eventType &&
        existing.actorUserId === input.actorUserId
        ? ('ALREADY_APPLIED' as const)
        : ('STALE' as const);
    }
    try {
      return await this.client.$transaction(
        async (tx) => {
          const scope = await participantScope(tx, input, ['ACTIVE']);
          if (!scope) return 'NOT_FOUND' as const;
          const [assignment, progress] = await Promise.all([
            tx.programMissionAssignment.findFirst({
              where: {
                id: input.assignmentId,
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                programEnrollmentId: scope.enrollment.id,
              },
            }),
            tx.programProgressSnapshot.findFirst({
              where: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                programEnrollmentId: scope.enrollment.id,
              },
            }),
          ]);
          if (
            !assignment ||
            !progress ||
            progress.currentAssignmentId !== assignment.id ||
            !['PRESENTED', 'STARTED'].includes(assignment.status) ||
            assignment.actionMode !== 'WORK'
          ) {
            return 'STALE' as const;
          }

          let sourceItemId: string | null = assignment.targetResourceId;
          const domainEvents: string[] = [];
          if (input.resultStatus === 'DONE') {
            if (['ITEM_FIND', 'NEXT_ITEM'].includes(assignment.missionDefinitionKey)) {
              const item = await tx.resaleItem.create({
                data: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  programEnrollmentId: scope.enrollment.id,
                  groupMembershipId: scope.membership.id,
                  ownerUserId: scope.membership.userId,
                  idempotencyKey: `${eventKey}:item`,
                  title: input.itemTitle!,
                  foundAt: input.occurredAt,
                },
              });
              sourceItemId = item.id;
              domainEvents.push('ITEM_FOUND');
            } else {
              if (!assignment.targetResourceId) return 'STALE' as const;
              const item = await tx.resaleItem.findFirst({
                where: {
                  id: assignment.targetResourceId,
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  programEnrollmentId: scope.enrollment.id,
                  groupMembershipId: scope.membership.id,
                  ownerUserId: input.actorUserId,
                },
              });
              if (!item) return 'NOT_FOUND' as const;
              const update = async (data: Prisma.ResaleItemUpdateManyMutationInput) => {
                const changed = await tx.resaleItem.updateMany({
                  where: { id: item.id, revision: item.revision },
                  data: { ...data, revision: { increment: 1 } },
                });
                if (changed.count !== 1) throw new Error('STALE_RESALE_ITEM');
              };
              if (assignment.missionDefinitionKey === 'PHOTO') {
                if (item.status !== 'FOUND') return 'STALE' as const;
                await update({ status: 'PHOTOGRAPHED' });
              } else if (assignment.missionDefinitionKey === 'LIST') {
                if (item.status !== 'PHOTOGRAPHED') return 'STALE' as const;
                await update({
                  status: 'LISTED',
                  listedAt: input.occurredAt,
                  reevaluateAt: plusHours(input.occurredAt, scope.settings.defaultWaitHours),
                });
                const first =
                  (await tx.programActionEvent.count({
                    where: {
                      workspaceId: input.workspaceId,
                      groupId: input.groupId,
                      programEnrollmentId: scope.enrollment.id,
                      eventType: 'FIRST_LISTING',
                    },
                  })) === 0;
                if (first) domainEvents.push('FIRST_LISTING');
              } else if (assignment.missionDefinitionKey === 'CHECK') {
                if (item.status !== 'LISTED' || input.reactionState === null)
                  return 'STALE' as const;
                if (input.reactionState === 'SOLD') {
                  const priorSales = await tx.resaleItem.count({
                    where: {
                      workspaceId: input.workspaceId,
                      groupId: input.groupId,
                      programEnrollmentId: scope.enrollment.id,
                      status: { in: ['SOLD', 'SHIPPED'] },
                    },
                  });
                  await update({
                    status: 'SOLD',
                    reactionState: 'SOLD',
                    reactionObservedAt: input.occurredAt,
                    soldAt: input.occurredAt,
                    soldPriceYen: input.soldPriceYen,
                    reevaluateAt: null,
                  });
                  domainEvents.push('ITEM_SOLD', priorSales === 0 ? 'FIRST_SALE' : 'SECOND_SALE');
                } else {
                  await update({
                    reactionState: input.reactionState,
                    reactionObservedAt: input.occurredAt,
                    reevaluateAt:
                      input.reactionState === 'REACTION'
                        ? plusHours(input.occurredAt, scope.settings.defaultWaitHours)
                        : null,
                  });
                  domainEvents.push('REACTION_OBSERVED');
                }
              } else if (assignment.missionDefinitionKey === 'IMPROVE') {
                if (item.status !== 'LISTED') return 'STALE' as const;
                await update({
                  reactionState: 'UNKNOWN',
                  lastImprovementType: input.improvementType!,
                  lastImprovedAt: input.occurredAt,
                  reevaluateAt: plusHours(input.occurredAt, scope.settings.defaultWaitHours),
                });
                const first =
                  (await tx.programActionEvent.count({
                    where: {
                      workspaceId: input.workspaceId,
                      groupId: input.groupId,
                      programEnrollmentId: scope.enrollment.id,
                      eventType: 'FIRST_IMPROVEMENT',
                    },
                  })) === 0;
                if (first) domainEvents.push('FIRST_IMPROVEMENT');
              } else if (assignment.missionDefinitionKey === 'SHIPPING') {
                if (item.status !== 'SOLD') return 'STALE' as const;
                await update({ status: 'SHIPPED', shippedAt: input.occurredAt });
                domainEvents.push('ITEM_SHIPPED');
              }
            }
            if (assignment.missionDefinitionKey === 'RECOVERY') {
              domainEvents.push('RECOVERED');
            }
          }

          const assignmentStatus = input.resultStatus === 'DONE' ? 'COMPLETED' : 'SKIPPED';
          const changed = await tx.programMissionAssignment.updateMany({
            where: { id: assignment.id, status: assignment.status },
            data:
              input.resultStatus === 'DONE'
                ? {
                    status: assignmentStatus,
                    startedAt: assignment.startedAt ?? input.occurredAt,
                    completedAt: input.occurredAt,
                  }
                : {
                    status: assignmentStatus,
                    startedAt: assignment.startedAt ?? input.occurredAt,
                    skippedAt: input.occurredAt,
                  },
          });
          if (changed.count !== 1) return 'STALE' as const;
          await tx.programActionEvent.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: scope.enrollment.id,
              missionAssignmentId: assignment.id,
              eventType,
              sourceResourceType: sourceItemId ? 'RESALE_ITEM' : null,
              sourceResourceId: sourceItemId,
              idempotencyKey: eventKey,
              schemaVersion: 1,
              metadata: {
                actionKey: assignment.missionDefinitionKey,
                resultStatus: input.resultStatus,
                note: input.note,
                reactionState: input.reactionState,
                improvementType: input.improvementType,
                soldPriceYen: input.soldPriceYen,
              },
              actorUserId: input.actorUserId,
              occurredAt: input.occurredAt,
            },
          });
          if (domainEvents.length > 0) {
            await tx.programActionEvent.createMany({
              data: domainEvents.map((domainEvent) => ({
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                programEnrollmentId: scope.enrollment.id,
                missionAssignmentId: assignment.id,
                eventType: domainEvent,
                sourceResourceType: sourceItemId ? 'RESALE_ITEM' : null,
                sourceResourceId: sourceItemId,
                idempotencyKey: `${eventKey}:${domainEvent}`,
                schemaVersion: 1,
                metadata: { actionKey: assignment.missionDefinitionKey },
                actorUserId: input.actorUserId,
                occurredAt: input.occurredAt,
              })),
              skipDuplicates: true,
            });
          }
          const progressed = await tx.programProgressSnapshot.updateMany({
            where: { id: progress.id, revision: progress.revision },
            data: {
              currentAssignmentId: null,
              stateKey: 'ACTIVE',
              bottleneckKey: null,
              completedMissionCount:
                input.resultStatus === 'DONE' ? { increment: 1 } : progress.completedMissionCount,
              lastActionAt: input.occurredAt,
              nextEvaluationAt: input.occurredAt,
              calculatedAt: input.occurredAt,
              revision: { increment: 1 },
            },
          });
          if (progressed.count !== 1) return 'STALE' as const;
          return 'APPLIED' as const;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'STALE_RESALE_ITEM') return 'STALE';
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        const concurrent = await this.client.programActionEvent.findUnique({
          where: {
            workspaceId_groupId_idempotencyKey: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              idempotencyKey: eventKey,
            },
          },
        });
        return concurrent?.programEnrollmentId === input.programEnrollmentId &&
          concurrent.missionAssignmentId === input.assignmentId &&
          concurrent.eventType === eventType &&
          concurrent.actorUserId === input.actorUserId
          ? 'ALREADY_APPLIED'
          : 'STALE';
      }
      throw error;
    }
  }
}
