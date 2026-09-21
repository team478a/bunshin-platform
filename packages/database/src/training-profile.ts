import {
  AI_TRAINING_LEARNING_CATALOG_VERSION,
  AI_TRAINING_V1_MODULE_KEY,
  findTrainingGoal,
  type TrainingChallengeKey,
  type TrainingGoalKey,
  type TrainingTopicKey,
  type TrainingUseCaseKey,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';

export type TrainingProfileWriteResult =
  | {
      outcome: 'SAVED' | 'ALREADY_SAVED';
      profile: {
        id: string;
        role: 'SALES' | 'OFFICE' | 'MANAGER' | 'OTHER';
        aiLevel: 'BEGINNER' | 'INTERMEDIATE';
      };
    }
  | { outcome: 'NOT_FOUND' | 'CONFLICT' };

const profileSelect = { id: true, role: true, aiLevel: true } as const;

export class PrismaTrainingParticipantProfileRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async save(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    role: 'SALES' | 'OFFICE' | 'MANAGER' | 'OTHER';
    aiLevel: 'BEGINNER' | 'INTERMEDIATE';
    aiUseCases: TrainingUseCaseKey[];
    workChallenges: TrainingChallengeKey[];
    preferredTopics: TrainingTopicKey[];
    dailyMinutes: 5 | 10 | 15;
    learningGoalKey: TrainingGoalKey;
    idempotencyKey: string;
    occurredAt: Date;
  }): Promise<TrainingProfileWriteResult> {
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
            select: { id: true, serviceProgramId: true, endsAt: true },
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
          const profile = await tx.trainingParticipantProfile.upsert({
            where: { programEnrollmentId: enrollment.id },
            create: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              groupMembershipId: membership.id,
              userId: input.actorUserId,
              role: input.role,
              aiLevel: input.aiLevel,
              aiUseCases: input.aiUseCases,
              workChallenges: input.workChallenges,
              preferredTopics: input.preferredTopics,
              dailyMinutes: input.dailyMinutes,
              learningGoalKey: input.learningGoalKey,
              assessmentVersion: AI_TRAINING_LEARNING_CATALOG_VERSION,
              updatedByUserId: input.actorUserId,
            },
            update: {
              role: input.role,
              aiLevel: input.aiLevel,
              aiUseCases: input.aiUseCases,
              workChallenges: input.workChallenges,
              preferredTopics: input.preferredTopics,
              dailyMinutes: input.dailyMinutes,
              learningGoalKey: input.learningGoalKey,
              assessmentVersion: AI_TRAINING_LEARNING_CATALOG_VERSION,
              updatedByUserId: input.actorUserId,
            },
            select: profileSelect,
          });
          const goal = findTrainingGoal(input.learningGoalKey);
          if (!goal) return { outcome: 'CONFLICT' } as const;
          await tx.programMemberGoal.updateMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              groupMembershipId: membership.id,
              status: 'ACTIVE',
            },
            data: { status: 'CANCELLED', updatedByUserId: input.actorUserId },
          });
          await tx.programMemberGoal.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              groupMembershipId: membership.id,
              goalDefinitionId: null,
              title: goal.label,
              metricType: 'ACTION',
              targetValue: 1,
              currentValue: 0,
              unit: '習得',
              status: 'ACTIVE',
              startsAt: input.occurredAt,
              dueAt: enrollment.endsAt,
              createdByUserId: input.actorUserId,
              updatedByUserId: input.actorUserId,
            },
          });
          await tx.programActionEvent.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              missionAssignmentId: null,
              eventType: 'TRAINING_INITIAL_ASSESSMENT_COMPLETED',
              sourceResourceType: 'TRAINING_PARTICIPANT_PROFILE',
              sourceResourceId: profile.id,
              idempotencyKey: input.idempotencyKey,
              schemaVersion: 1,
              metadata: {
                role: input.role,
                aiLevel: input.aiLevel,
                aiUseCases: input.aiUseCases,
                workChallenges: input.workChallenges,
                preferredTopics: input.preferredTopics,
                dailyMinutes: input.dailyMinutes,
                learningGoalKey: input.learningGoalKey,
                assessmentVersion: AI_TRAINING_LEARNING_CATALOG_VERSION,
              },
              actorUserId: input.actorUserId,
              occurredAt: input.occurredAt,
            },
          });
          return { outcome: 'SAVED', profile } as const;
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
    idempotencyKey: string;
  }): Promise<TrainingProfileWriteResult | null> {
    const event = await this.client.programActionEvent.findUnique({
      where: {
        workspaceId_groupId_idempotencyKey: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (!event) return null;
    if (
      event.programEnrollmentId !== input.programEnrollmentId ||
      event.eventType !== 'TRAINING_INITIAL_ASSESSMENT_COMPLETED' ||
      event.sourceResourceType !== 'TRAINING_PARTICIPANT_PROFILE' ||
      !event.sourceResourceId ||
      event.actorUserId !== input.actorUserId
    ) {
      return { outcome: 'CONFLICT' };
    }
    const profile = await this.client.trainingParticipantProfile.findFirst({
      where: {
        id: event.sourceResourceId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: input.programEnrollmentId,
        userId: input.actorUserId,
      },
      select: profileSelect,
    });
    return profile ? { outcome: 'ALREADY_SAVED', profile } : { outcome: 'CONFLICT' };
  }
}
