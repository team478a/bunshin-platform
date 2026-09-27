import { AI_TRAINING_V1_MODULE_KEY, type TrainingWorkResult } from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';

export type TrainingWorkResultWriteResult =
  | { outcome: 'RECORDED' | 'ALREADY_RECORDED'; eventId: string }
  | { outcome: 'NOT_FOUND' | 'CONFLICT' };

export class PrismaTrainingWorkResultRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async record(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    missionAssignmentId: string;
    result: TrainingWorkResult;
    idempotencyKey: string;
    occurredAt: Date;
  }): Promise<TrainingWorkResultWriteResult> {
    const existing = await this.client.programActionEvent.findUnique({
      where: {
        workspaceId_groupId_idempotencyKey: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return this.existingResult(input, existing);
    try {
      return await this.client.$transaction(async (tx) => {
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
          select: { id: true },
        });
        if (!program) return { outcome: 'NOT_FOUND' } as const;
        const assignment = await tx.programMissionAssignment.findFirst({
          where: {
            id: input.missionAssignmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            status: 'COMPLETED',
          },
          select: { id: true, missionDefinitionKey: true },
        });
        if (!assignment) return { outcome: 'NOT_FOUND' } as const;
        const event = await tx.programActionEvent.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            missionAssignmentId: assignment.id,
            eventType: 'TRAINING_WORK_RESULT_RECORDED',
            idempotencyKey: input.idempotencyKey,
            schemaVersion: 1,
            metadata: {
              schemaVersion: 1,
              assignmentId: assignment.id,
              missionKey: assignment.missionDefinitionKey,
              result: input.result,
            },
            actorUserId: input.actorUserId,
            occurredAt: input.occurredAt,
          },
          select: { id: true },
        });
        await tx.programProgressSnapshot.updateMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
          },
          data: {
            lastActionAt: input.occurredAt,
            calculatedAt: input.occurredAt,
            revision: { increment: 1 },
          },
        });
        return { outcome: 'RECORDED', eventId: event.id } as const;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const event = await this.client.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      return event ? this.existingResult(input, event) : { outcome: 'CONFLICT' };
    }
  }

  private existingResult(
    input: {
      actorUserId: string;
      programEnrollmentId: string;
      missionAssignmentId: string;
      result: TrainingWorkResult;
    },
    event: {
      id: string;
      actorUserId: string | null;
      programEnrollmentId: string;
      missionAssignmentId: string | null;
      eventType: string;
      metadata: unknown;
    },
  ): TrainingWorkResultWriteResult {
    const metadata =
      typeof event.metadata === 'object' &&
      event.metadata !== null &&
      !Array.isArray(event.metadata)
        ? (event.metadata as Record<string, unknown>)
        : null;
    return event.actorUserId === input.actorUserId &&
      event.programEnrollmentId === input.programEnrollmentId &&
      event.missionAssignmentId === input.missionAssignmentId &&
      event.eventType === 'TRAINING_WORK_RESULT_RECORDED' &&
      metadata?.['result'] === input.result
      ? { outcome: 'ALREADY_RECORDED', eventId: event.id }
      : { outcome: 'CONFLICT' };
  }
}
