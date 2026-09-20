import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';

export type TrainingAnswerSubmissionResult =
  | {
      outcome: 'SUBMITTED' | 'ALREADY_SUBMITTED';
      answer: {
        id: string;
        missionAssignmentId: string;
        evaluationStatus: 'PENDING' | 'READY' | 'FAILED';
        createdAt: Date;
        updatedAt: Date;
      };
      eventId: string;
    }
  | { outcome: 'NOT_FOUND' | 'CONFLICT' };

export class PrismaTrainingAnswerRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async submit(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    missionAssignmentId: string;
    answer: string;
    idempotencyKey: string;
    occurredAt: Date;
  }): Promise<TrainingAnswerSubmissionResult> {
    const [enrollment, membership] = await Promise.all([
      this.client.programEnrollment.findFirst({
        where: {
          id: input.programEnrollmentId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'ACTIVE',
        },
        select: { id: true, groupMembershipId: true },
      }),
      this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    ]);
    if (!enrollment || !membership || enrollment.groupMembershipId !== membership.id)
      return { outcome: 'NOT_FOUND' };

    const eventWhere = {
      workspaceId_groupId_idempotencyKey: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        idempotencyKey: input.idempotencyKey,
      },
    };
    const existingEvent = await this.client.programActionEvent.findUnique({ where: eventWhere });
    if (existingEvent) return this.resultForExistingEvent(input, existingEvent);

    try {
      return await this.client.$transaction(async (tx) => {
        const assignment = await tx.programMissionAssignment.findFirst({
          where: {
            id: input.missionAssignmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            actionMode: 'WORK',
            status: { in: ['PRESENTED', 'STARTED'] },
          },
          select: { id: true, missionDefinitionKey: true },
        });
        if (!assignment) return { outcome: 'NOT_FOUND' } as const;

        const existingAnswer = await tx.trainingMissionAnswer.findUnique({
          where: { missionAssignmentId: assignment.id },
          select: { id: true },
        });
        if (existingAnswer) return { outcome: 'CONFLICT' } as const;

        const answer = await tx.trainingMissionAnswer.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            missionAssignmentId: assignment.id,
            userId: input.actorUserId,
            answer: input.answer,
            evaluationStatus: 'PENDING',
          },
          select: {
            id: true,
            missionAssignmentId: true,
            evaluationStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        const event = await tx.programActionEvent.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            missionAssignmentId: assignment.id,
            eventType: 'ANSWER_SUBMITTED',
            sourceResourceType: 'TRAINING_MISSION_ANSWER',
            sourceResourceId: answer.id,
            idempotencyKey: input.idempotencyKey,
            schemaVersion: 1,
            metadata: {
              missionDefinitionKey: assignment.missionDefinitionKey,
              answerLength: input.answer.length,
            } as Prisma.InputJsonValue,
            actorUserId: input.actorUserId,
            occurredAt: input.occurredAt,
          },
          select: { id: true },
        });
        return { outcome: 'SUBMITTED', answer, eventId: event.id } as const;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const event = await this.client.programActionEvent.findUnique({ where: eventWhere });
      if (event) return this.resultForExistingEvent(input, event);
      return { outcome: 'CONFLICT' };
    }
  }

  private async resultForExistingEvent(
    input: {
      workspaceId: string;
      groupId: string;
      actorUserId: string;
      programEnrollmentId: string;
      missionAssignmentId: string;
    },
    event: {
      id: string;
      programEnrollmentId: string;
      missionAssignmentId: string | null;
      eventType: string;
      sourceResourceType: string | null;
      sourceResourceId: string | null;
      actorUserId: string | null;
    },
  ): Promise<TrainingAnswerSubmissionResult> {
    if (
      event.programEnrollmentId !== input.programEnrollmentId ||
      event.missionAssignmentId !== input.missionAssignmentId ||
      event.eventType !== 'ANSWER_SUBMITTED' ||
      event.sourceResourceType !== 'TRAINING_MISSION_ANSWER' ||
      event.sourceResourceId === null ||
      event.actorUserId !== input.actorUserId
    ) {
      return { outcome: 'CONFLICT' };
    }
    const answer = await this.client.trainingMissionAnswer.findFirst({
      where: {
        id: event.sourceResourceId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: input.programEnrollmentId,
        missionAssignmentId: input.missionAssignmentId,
        userId: input.actorUserId,
      },
      select: {
        id: true,
        missionAssignmentId: true,
        evaluationStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return answer
      ? { outcome: 'ALREADY_SUBMITTED', answer, eventId: event.id }
      : { outcome: 'CONFLICT' };
  }
}
