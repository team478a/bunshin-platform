import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';

export type TrainingToolkitItemView = {
  id: string;
  title: string;
  content: string;
  missionDefinitionKey: string;
  createdAt: Date;
};

export type SaveTrainingToolkitItemResult =
  | { outcome: 'SAVED' | 'ALREADY_SAVED'; item: TrainingToolkitItemView; eventId: string }
  | { outcome: 'NOT_FOUND' | 'NOT_ELIGIBLE' | 'CONFLICT' };

const isRecord = (value: Prisma.JsonValue | null): value is Prisma.JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toolkitItemView = (item: {
  id: string;
  title: string;
  contentSnapshot: string;
  missionDefinitionKey: string;
  createdAt: Date;
}): TrainingToolkitItemView => ({
  id: item.id,
  title: item.title,
  content: item.contentSnapshot,
  missionDefinitionKey: item.missionDefinitionKey,
  createdAt: item.createdAt,
});

export class PrismaTrainingToolkitRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
  }): Promise<TrainingToolkitItemView[] | null> {
    const enrollment = await this.ownedEnrollment(input, ['ACTIVE', 'COMPLETED', 'EXPIRED']);
    if (!enrollment) return null;
    const items = await this.client.trainingToolkitItem.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: enrollment.id,
        userId: input.actorUserId,
      },
      select: {
        id: true,
        title: true,
        contentSnapshot: true,
        missionDefinitionKey: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return items.map(toolkitItemView);
  }

  async save(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    answerId: string;
    idempotencyKey: string;
    occurredAt: Date;
  }): Promise<SaveTrainingToolkitItemResult> {
    const enrollment = await this.ownedEnrollment(input, ['ACTIVE']);
    if (!enrollment) return { outcome: 'NOT_FOUND' };
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
      return await this.client.$transaction(
        async (tx) => {
          const answer = await tx.trainingMissionAnswer.findFirst({
            where: {
              id: input.answerId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              userId: input.actorUserId,
              evaluationStatus: 'READY',
            },
            select: {
              id: true,
              missionAssignmentId: true,
              answer: true,
              evaluation: true,
            },
          });
          if (!answer) return { outcome: 'NOT_FOUND' } as const;
          if (!isRecord(answer.evaluation) || answer.evaluation['result'] !== 'PASS') {
            return { outcome: 'NOT_ELIGIBLE' } as const;
          }
          const assignment = await tx.programMissionAssignment.findFirst({
            where: {
              id: answer.missionAssignmentId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              status: 'COMPLETED',
            },
            select: { missionDefinitionKey: true, displaySnapshot: true },
          });
          if (!assignment) return { outcome: 'NOT_ELIGIBLE' } as const;
          const existing = await tx.trainingToolkitItem.findUnique({
            where: { trainingMissionAnswerId: answer.id },
            select: {
              id: true,
              title: true,
              contentSnapshot: true,
              missionDefinitionKey: true,
              createdAt: true,
            },
          });
          if (existing) return { outcome: 'CONFLICT' } as const;
          const display = isRecord(assignment.displaySnapshot) ? assignment.displaySnapshot : null;
          const displayTitle = display?.['title'];
          const title =
            typeof displayTitle === 'string' && displayTitle.trim()
              ? displayTitle.trim().slice(0, 160)
              : 'AI研修で作った成果物';
          const created = await tx.trainingToolkitItem.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              missionAssignmentId: answer.missionAssignmentId,
              trainingMissionAnswerId: answer.id,
              userId: input.actorUserId,
              missionDefinitionKey: assignment.missionDefinitionKey,
              title,
              contentSnapshot: answer.answer,
              createdAt: input.occurredAt,
            },
            select: {
              id: true,
              title: true,
              contentSnapshot: true,
              missionDefinitionKey: true,
              createdAt: true,
            },
          });
          const event = await tx.programActionEvent.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              missionAssignmentId: answer.missionAssignmentId,
              eventType: 'TRAINING_TOOLKIT_ITEM_SAVED',
              sourceResourceType: 'TRAINING_TOOLKIT_ITEM',
              sourceResourceId: created.id,
              idempotencyKey: input.idempotencyKey,
              schemaVersion: 1,
              metadata: { missionDefinitionKey: assignment.missionDefinitionKey },
              actorUserId: input.actorUserId,
              occurredAt: input.occurredAt,
            },
            select: { id: true },
          });
          return { outcome: 'SAVED', item: toolkitItemView(created), eventId: event.id } as const;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const event = await this.client.programActionEvent.findUnique({ where: eventWhere });
      if (event) return this.resultForExistingEvent(input, event);
      return { outcome: 'CONFLICT' };
    }
  }

  private async ownedEnrollment(
    input: {
      workspaceId: string;
      groupId: string;
      actorUserId: string;
      programEnrollmentId: string;
    },
    statuses: ('ACTIVE' | 'COMPLETED' | 'EXPIRED')[],
  ) {
    const membership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!membership) return null;
    return this.client.programEnrollment.findFirst({
      where: {
        id: input.programEnrollmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: membership.id,
        status: { in: statuses },
      },
      select: { id: true },
    });
  }

  private async resultForExistingEvent(
    input: {
      workspaceId: string;
      groupId: string;
      actorUserId: string;
      programEnrollmentId: string;
    },
    event: {
      id: string;
      programEnrollmentId: string;
      eventType: string;
      sourceResourceType: string | null;
      sourceResourceId: string | null;
      actorUserId: string | null;
    },
  ): Promise<SaveTrainingToolkitItemResult> {
    if (
      event.programEnrollmentId !== input.programEnrollmentId ||
      event.eventType !== 'TRAINING_TOOLKIT_ITEM_SAVED' ||
      event.sourceResourceType !== 'TRAINING_TOOLKIT_ITEM' ||
      !event.sourceResourceId ||
      event.actorUserId !== input.actorUserId
    ) {
      return { outcome: 'CONFLICT' };
    }
    const item = await this.client.trainingToolkitItem.findFirst({
      where: {
        id: event.sourceResourceId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: input.programEnrollmentId,
        userId: input.actorUserId,
      },
      select: {
        id: true,
        title: true,
        contentSnapshot: true,
        missionDefinitionKey: true,
        createdAt: true,
      },
    });
    return item
      ? { outcome: 'ALREADY_SAVED', item: toolkitItemView(item), eventId: event.id }
      : { outcome: 'CONFLICT' };
  }
}
