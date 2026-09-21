import {
  buildTrainingGrowthSummary,
  type TrainingGrowthSummary,
} from '@bunshin/capability-training';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './index';

const titleFromSnapshot = (value: Prisma.JsonValue): string | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const title = value['title'];
  return typeof title === 'string' && title.trim() ? title.trim() : null;
};

export class PrismaTrainingGrowthRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async get(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    now: Date;
  }): Promise<TrainingGrowthSummary | null> {
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
    const enrollment = await this.client.programEnrollment.findFirst({
      where: {
        id: input.programEnrollmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: membership.id,
        status: { in: ['ACTIVE', 'COMPLETED', 'EXPIRED'] },
      },
      select: { id: true },
    });
    if (!enrollment) return null;

    const activitySince = new Date(input.now.getTime() - 7 * 86_400_000);
    const [profile, progress, completedAssignments, activities] = await Promise.all([
      this.client.trainingParticipantProfile.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          groupMembershipId: membership.id,
          userId: input.actorUserId,
        },
        select: { skillScores: true, streak: true },
      }),
      this.client.programProgressSnapshot.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
        },
        select: { completedMissionCount: true },
      }),
      this.client.programMissionAssignment.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          status: 'COMPLETED',
        },
        select: { displaySnapshot: true },
        orderBy: [{ completedAt: 'asc' }, { sequence: 'asc' }],
      }),
      this.client.programActionEvent.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          actorUserId: input.actorUserId,
          eventType: { in: ['ANSWER_SUBMITTED', 'ANSWER_EVALUATED', 'MISSION_COMPLETED'] },
          occurredAt: { gte: activitySince, lte: input.now },
        },
        select: { occurredAt: true },
      }),
    ]);
    if (!profile) return null;

    return buildTrainingGrowthSummary({
      completedMissionCount: progress?.completedMissionCount ?? completedAssignments.length,
      streak: profile.streak,
      skillScores: profile.skillScores,
      activityDates: activities.map(({ occurredAt }) => occurredAt),
      completedMissionTitles: completedAssignments.flatMap(({ displaySnapshot }) => {
        const title = titleFromSnapshot(displaySnapshot);
        return title ? [title] : [];
      }),
      now: input.now,
    });
  }
}
