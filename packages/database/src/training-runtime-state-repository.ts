import {
  TRAINING_CHALLENGE_KEYS,
  TRAINING_GOAL_KEYS,
  TRAINING_TOPIC_KEYS,
  TRAINING_USE_CASE_KEYS,
  type AiTrainingParticipantState,
  type AiTrainingRuntimeRepository,
} from '@bunshin/capability-training';
import type { PrismaClient } from '@prisma/client';
import { participantAction, resolveScope, selectedKeys } from './training-runtime-shared';

export class PrismaAiTrainingRuntimeStateRepository {
  constructor(private readonly client: PrismaClient) {}

  async findState(input: Parameters<AiTrainingRuntimeRepository['findState']>[0]) {
    const scope = await resolveScope(this.client, input, ['ACTIVE', 'COMPLETED', 'EXPIRED']);
    if (!scope) return null;
    const [profile, progress, goal] = await Promise.all([
      this.client.trainingParticipantProfile.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
          groupMembershipId: scope.membership.id,
          userId: input.actorUserId,
        },
      }),
      this.client.programProgressSnapshot.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
        },
      }),
      this.client.programMemberGoal.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
          groupMembershipId: scope.membership.id,
          status: 'ACTIVE',
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { title: true },
      }),
    ]);
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
    const submission = assignment
      ? await this.client.trainingMissionAnswer.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: scope.enrollment.id,
            missionAssignmentId: assignment.id,
            userId: input.actorUserId,
          },
          select: { id: true, evaluationStatus: true },
        })
      : null;
    return {
      enrollmentId: scope.enrollment.id,
      programName: scope.program.displayName,
      enrollmentStatus: scope.enrollment.status as AiTrainingParticipantState['enrollmentStatus'],
      startsAt: scope.enrollment.startsAt!,
      endsAt: scope.enrollment.endsAt,
      profile:
        profile &&
        profile.learningGoalKey &&
        TRAINING_GOAL_KEYS.includes(profile.learningGoalKey as (typeof TRAINING_GOAL_KEYS)[number])
          ? {
              role: profile.role,
              aiLevel: profile.aiLevel,
              aiUseCases: selectedKeys(profile.aiUseCases, TRAINING_USE_CASE_KEYS),
              workChallenges: selectedKeys(profile.workChallenges, TRAINING_CHALLENGE_KEYS),
              preferredTopics: selectedKeys(profile.preferredTopics, TRAINING_TOPIC_KEYS),
              dailyMinutes: [5, 10, 15].includes(profile.dailyMinutes)
                ? (profile.dailyMinutes as 5 | 10 | 15)
                : 10,
              learningGoalKey: profile.learningGoalKey as (typeof TRAINING_GOAL_KEYS)[number],
            }
          : null,
      goal,
      action: assignment ? participantAction(assignment, submission) : null,
    };
  }
}
