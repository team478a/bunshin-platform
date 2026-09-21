import {
  AI_TRAINING_V1_MODULE_KEY,
  parseAiTrainingOperationsSettings,
  type TrainingInteractionType,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';

export type TrainingInteractionWriteResult =
  | { outcome: 'RECORDED' | 'ALREADY_RECORDED'; eventId: string }
  | { outcome: 'NOT_FOUND' | 'CONFLICT' };

export class PrismaTrainingInteractionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async record(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    missionAssignmentId: string;
    interactionType: TrainingInteractionType;
    idempotencyKey: string;
    occurredAt: Date;
  }): Promise<TrainingInteractionWriteResult> {
    const existing = await this.findIdempotentResult(input);
    if (existing) return existing;
    try {
      return await this.client.$transaction(
        async (tx) => {
          const membership = await tx.groupMembership.findFirst({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              userId: input.actorUserId,
              serviceRole: 'PARTICIPANT',
              status: 'ACTIVE',
            },
            select: { id: true },
          });
          if (!membership) return { outcome: 'NOT_FOUND' } as const;
          const enrollment = await tx.programEnrollment.findFirst({
            where: {
              id: input.programEnrollmentId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: membership.id,
              status: 'ACTIVE',
              startsAt: { not: null },
            },
            select: { id: true, serviceProgramId: true },
          });
          if (!enrollment) return { outcome: 'NOT_FOUND' } as const;
          const program = await tx.serviceProgram.findFirst({
            where: {
              id: enrollment.serviceProgramId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              status: 'ACTIVE',
              settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
            },
            select: { id: true, settings: true },
          });
          if (!program) return { outcome: 'NOT_FOUND' } as const;
          const assignment = await tx.programMissionAssignment.findFirst({
            where: {
              id: input.missionAssignmentId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              actionMode: 'WORK',
              status: { in: ['PRESENTED', 'STARTED'] },
            },
            select: { id: true, status: true, missionDefinitionKey: true },
          });
          if (!assignment) return { outcome: 'NOT_FOUND' } as const;
          if (assignment.status === 'PRESENTED' && input.interactionType !== 'TRAINING_POSTPONED') {
            await tx.programMissionAssignment.update({
              where: { id: assignment.id },
              data: { status: 'STARTED', startedAt: input.occurredAt },
            });
          }
          const event = await tx.programActionEvent.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              missionAssignmentId: assignment.id,
              eventType: input.interactionType,
              sourceResourceType: 'PROGRAM_MISSION_ASSIGNMENT',
              sourceResourceId: assignment.id,
              idempotencyKey: input.idempotencyKey,
              schemaVersion: 1,
              metadata: {
                missionDefinitionKey: assignment.missionDefinitionKey,
                ...(input.interactionType === 'TRAINING_POSTPONED'
                  ? {
                      remindAt: new Date(
                        input.occurredAt.getTime() +
                          parseAiTrainingOperationsSettings(program.settings)
                            .postponedReminderHours *
                            60 *
                            60 *
                            1000,
                      ).toISOString(),
                    }
                  : {}),
              },
              actorUserId: input.actorUserId,
              occurredAt: input.occurredAt,
            },
            select: { id: true },
          });
          return { outcome: 'RECORDED', eventId: event.id } as const;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !['P2002', 'P2034'].includes(error.code)
      ) {
        throw error;
      }
      return (await this.findIdempotentResult(input)) ?? { outcome: 'CONFLICT' };
    }
  }

  private async findIdempotentResult(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    missionAssignmentId: string;
    interactionType: TrainingInteractionType;
    idempotencyKey: string;
  }): Promise<TrainingInteractionWriteResult | null> {
    const event = await this.client.programActionEvent.findUnique({
      where: {
        workspaceId_groupId_idempotencyKey: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: {
        id: true,
        programEnrollmentId: true,
        missionAssignmentId: true,
        eventType: true,
        sourceResourceType: true,
        sourceResourceId: true,
        actorUserId: true,
      },
    });
    if (!event) return null;
    return event.programEnrollmentId === input.programEnrollmentId &&
      event.missionAssignmentId === input.missionAssignmentId &&
      event.eventType === input.interactionType &&
      event.sourceResourceType === 'PROGRAM_MISSION_ASSIGNMENT' &&
      event.sourceResourceId === input.missionAssignmentId &&
      event.actorUserId === input.actorUserId
      ? { outcome: 'ALREADY_RECORDED', eventId: event.id }
      : { outcome: 'CONFLICT' };
  }
}
