import {
  TRAINING_GOAL_KEYS,
  isPersonalLearningPilotProgram,
  parseTrainingSkillScores,
  resolveTrainingWorkContext,
  type AiTrainingRuntimeCandidate,
  type AiTrainingRuntimeRepository,
} from '@bunshin/capability-training';
import type { PrismaClient } from '@prisma/client';
import { resolveScope } from './training-runtime-shared';

export class PrismaAiTrainingRuntimeCandidateRepository {
  constructor(private readonly client: PrismaClient) {}

  async findCandidate(input: Parameters<AiTrainingRuntimeRepository['findCandidate']>[0]) {
    const scope = await resolveScope(this.client, input, ['ACTIVE'], input.now);
    if (!scope || isPersonalLearningPilotProgram(scope.program.settings)) return null;
    const [profile, progress, assignments, lastUserEvent, workUseCount] = await Promise.all([
      this.client.trainingParticipantProfile.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
          groupMembershipId: scope.membership.id,
          userId: input.actorUserId,
        },
      }),
      this.client.programProgressSnapshot.findUnique({
        where: { programEnrollmentId: scope.enrollment.id },
      }),
      this.client.programMissionAssignment.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
        },
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      }),
      this.client.programActionEvent.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
          actorUserId: input.actorUserId,
          eventType: {
            in: [
              'ANSWER_SUBMITTED',
              'MISSION_STARTED',
              'HINT_VIEWED',
              'HELP_REQUESTED',
              'TRAINING_POSTPONED',
            ],
          },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      }),
      this.client.programActionEvent.count({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: scope.enrollment.id,
          actorUserId: input.actorUserId,
          eventType: 'TRAINING_WORK_RESULT_RECORDED',
          OR: [
            { metadata: { path: ['result'], equals: 'USED_AS_IS' } },
            { metadata: { path: ['result'], equals: 'USED_WITH_EDITS' } },
          ],
        },
      }),
    ]);
    if (!profile) return null;
    const workContext = resolveTrainingWorkContext(profile.workContext, profile.role);
    const current = progress?.currentAssignmentId
      ? assignments.find(({ id }) => id === progress.currentAssignmentId)
      : null;
    if (
      current &&
      ['PRESENTED', 'STARTED'].includes(current.status) &&
      !(current.actionMode === 'WAIT' && current.reevaluateAt && current.reevaluateAt <= input.now)
    ) {
      return null;
    }
    if (assignments.some((a) => a.targetResourceType === 'PERSONAL_LEARNING_PLAN')) return null;
    const completed = assignments.filter(({ status }) => status === 'COMPLETED');
    const phase = ['FOUNDATION', 'PRACTICE', 'APPLICATION'].includes(progress?.phaseKey ?? '')
      ? (progress!.phaseKey as AiTrainingRuntimeCandidate['currentPhase'])
      : 'FOUNDATION';
    return {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: scope.enrollment.id,
      programTemplateVersionId: scope.program.programTemplateVersionId,
      participantUserId: input.actorUserId,
      profileUpdatedAt: profile.updatedAt,
      profileId: profile.id,
      settings: scope.settings,
      profile: {
        role: profile.role,
        aiLevel: profile.aiLevel,
        learningGoalKey:
          profile.learningGoalKey &&
          TRAINING_GOAL_KEYS.includes(
            profile.learningGoalKey as (typeof TRAINING_GOAL_KEYS)[number],
          )
            ? (profile.learningGoalKey as (typeof TRAINING_GOAL_KEYS)[number])
            : null,
        needsReview: profile.needsReview,
        recentSuccesses: profile.recentSuccesses,
        recentFailures: profile.recentFailures,
        streak: profile.streak,
        skillScores: parseTrainingSkillScores(profile.skillScores),
        workContext,
      },
      currentPhase: phase,
      completedMissionKeys: completed.map(({ missionDefinitionKey }) => missionDefinitionKey),
      completedMissionCount: completed.length,
      lastMissionKey: assignments.at(-1)?.missionDefinitionKey ?? null,
      bottleneckKey: progress?.bottleneckKey ?? null,
      activityBaselineAt: scope.enrollment.startsAt!,
      lastActionAt: lastUserEvent?.occurredAt ?? progress?.lastActionAt ?? null,
      activeWaitUntil:
        current?.actionMode === 'WAIT' && current.status === 'PRESENTED'
          ? current.reevaluateAt
          : null,
      progressRevision: progress?.revision ?? null,
      workUseCount,
      missions: scope.missions,
    };
  }
}
