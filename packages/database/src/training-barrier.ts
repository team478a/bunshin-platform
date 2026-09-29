import {
  AI_TRAINING_V1_MODULE_KEY,
  applyTrainingBarrierAdjustment,
  parseAiTrainingActionDisplay,
  restoreTrainingStandardVariant,
  type AiTrainingActionDisplaySnapshot,
  type TrainingBarrierReason,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';
import { lockTrainingEnrollmentData } from './training-data-lock';
import { trainingEnrollmentPeriodWhere } from './training-enrollment-period';

export type TrainingBarrierAction =
  { type: 'BARRIER'; reason: TrainingBarrierReason } | { type: 'RESTORE_STANDARD' };

export type TrainingBarrierWriteResult =
  | {
      outcome: 'RECORDED' | 'ALREADY_RECORDED';
      eventId: string;
      display: AiTrainingActionDisplaySnapshot;
    }
  | { outcome: 'NOT_FOUND' | 'CONFLICT' };

const eventTypeFor = (action: TrainingBarrierAction) =>
  action.type === 'BARRIER' ? 'TRAINING_BARRIER_RECORDED' : 'TRAINING_STANDARD_VARIANT_RESTORED';

export class PrismaTrainingBarrierRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async record(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    missionAssignmentId: string;
    action: TrainingBarrierAction;
    idempotencyKey: string;
    occurredAt: Date;
  }): Promise<TrainingBarrierWriteResult> {
    const existing = await this.findIdempotentResult(input);
    if (existing) return existing;
    try {
      return await this.client.$transaction(
        async (tx) => {
          await lockTrainingEnrollmentData(tx, input);
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
              AND: [trainingEnrollmentPeriodWhere(new Date())],
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
              actionMode: 'WORK',
              status: { in: ['PRESENTED', 'STARTED'] },
            },
            select: {
              id: true,
              status: true,
              missionDefinitionKey: true,
              displaySnapshot: true,
            },
          });
          if (!assignment) return { outcome: 'NOT_FOUND' } as const;
          const answer = await tx.trainingMissionAnswer.findFirst({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              missionAssignmentId: assignment.id,
              userId: input.actorUserId,
            },
            select: { id: true },
          });
          if (answer) return { outcome: 'CONFLICT' } as const;
          const currentDisplay = parseAiTrainingActionDisplay(assignment.displaySnapshot);
          if (!currentDisplay) return { outcome: 'CONFLICT' } as const;
          const display =
            input.action.type === 'BARRIER'
              ? applyTrainingBarrierAdjustment(currentDisplay, input.action.reason)
              : restoreTrainingStandardVariant(currentDisplay);
          if (!display) return { outcome: 'CONFLICT' } as const;
          await tx.programMissionAssignment.update({
            where: { id: assignment.id },
            data: {
              displaySnapshot: display as unknown as Prisma.InputJsonValue,
              variantKey: display.missionVariant ?? 'STANDARD',
              ...(assignment.status === 'PRESENTED'
                ? { status: 'STARTED', startedAt: input.occurredAt }
                : {}),
            },
          });
          const event = await tx.programActionEvent.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              missionAssignmentId: assignment.id,
              eventType: eventTypeFor(input.action),
              sourceResourceType: 'PROGRAM_MISSION_ASSIGNMENT',
              sourceResourceId: assignment.id,
              idempotencyKey: input.idempotencyKey,
              schemaVersion: 1,
              metadata: {
                missionDefinitionKey: assignment.missionDefinitionKey,
                actionType: input.action.type,
                ...(input.action.type === 'BARRIER' ? { barrierReason: input.action.reason } : {}),
                missionVariant: display.missionVariant ?? 'STANDARD',
                difficulty: display.difficulty ?? 'STANDARD',
                practiceMode: display.practiceMode ?? 'PRACTICE',
              },
              actorUserId: input.actorUserId,
              occurredAt: input.occurredAt,
            },
            select: { id: true },
          });
          return { outcome: 'RECORDED', eventId: event.id, display } as const;
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
    action: TrainingBarrierAction;
    idempotencyKey: string;
  }): Promise<TrainingBarrierWriteResult | null> {
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
        metadata: true,
      },
    });
    if (!event) return null;
    const sameRequest =
      event.programEnrollmentId === input.programEnrollmentId &&
      event.missionAssignmentId === input.missionAssignmentId &&
      event.eventType === eventTypeFor(input.action) &&
      event.sourceResourceType === 'PROGRAM_MISSION_ASSIGNMENT' &&
      event.sourceResourceId === input.missionAssignmentId &&
      event.actorUserId === input.actorUserId &&
      typeof event.metadata === 'object' &&
      event.metadata !== null &&
      !Array.isArray(event.metadata) &&
      (event.metadata as Record<string, unknown>)['actionType'] === input.action.type &&
      (input.action.type !== 'BARRIER' ||
        (event.metadata as Record<string, unknown>)['barrierReason'] === input.action.reason);
    if (!sameRequest) return { outcome: 'CONFLICT' };
    const assignment = await this.client.programMissionAssignment.findFirst({
      where: {
        id: input.missionAssignmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: input.programEnrollmentId,
      },
      select: { displaySnapshot: true },
    });
    const display = assignment ? parseAiTrainingActionDisplay(assignment.displaySnapshot) : null;
    return display
      ? { outcome: 'ALREADY_RECORDED', eventId: event.id, display }
      : { outcome: 'CONFLICT' };
  }
}
