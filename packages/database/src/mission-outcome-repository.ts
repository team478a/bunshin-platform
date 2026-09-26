import type {
  MissionFeedback,
  MissionOutcomeRepository,
  PostRecord,
} from '@bunshin/capability-social';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';
import { missionActivity } from './mission-activity-mapper';

function postRecord(row: Prisma.PostRecordGetPayload<object>): PostRecord {
  return { ...row, manualMetrics: row.manualMetrics as Record<string, unknown> | null };
}
function missionFeedback(row: Prisma.MissionFeedbackGetPayload<object>): MissionFeedback {
  return row;
}
export class PrismaMissionOutcomeRepository implements MissionOutcomeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private async authorized(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
    manage: boolean,
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      include: {
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!bunshin) return null;
    const role = bunshin.workspace.memberships[0]?.role;
    return !manage || (role && canManageBunshin(role, input.actorUserId, bunshin.ownerUserId))
      ? bunshin
      : null;
  }
  private mission(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; dailyMissionId: string },
  ) {
    return client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      include: { decision: true, socialProfile: { select: { platform: true } } },
    });
  }
  private activityByKey(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; actorUserId: string; idempotencyKey: string },
  ) {
    return client.missionActivity.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }
  async getPost(input: Parameters<MissionOutcomeRepository['getPost']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.client.postRecord.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
      },
    });
    return value ? postRecord(value) : null;
  }
  async recordPost(input: Parameters<MissionOutcomeRepository['recordPost']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const mission = await this.mission(tx, input);
      if (!mission) return null;
      if (mission.decision?.decision !== 'ACCEPTED')
        throw new ApplicationError('CONFLICT', 'mission must be accepted before posting');
      if (mission.socialProfile && mission.socialProfile.platform !== input.platform)
        throw new ApplicationError('VALIDATION_ERROR', 'platform does not match mission profile');
      const existing = await tx.postRecord.findUnique({
        where: { dailyMissionId: input.dailyMissionId },
      });
      if (existing) {
        if (existing.platform !== input.platform || existing.postUrl !== input.postUrl)
          throw new ApplicationError('CONFLICT', 'post record already exists');
        const activity = await tx.missionActivity.findFirstOrThrow({
          where: { dailyMissionId: input.dailyMissionId, type: 'POSTED' },
          orderBy: { occurredAt: 'asc' },
        });
        return { post: postRecord(existing), activity: missionActivity(activity) };
      }
      const collision = await this.activityByKey(tx, input);
      if (collision) throw new ApplicationError('CONFLICT', 'idempotency key was already used');
      const post = await tx.postRecord.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          platform: input.platform,
          postedAt: input.postedAt,
          postUrl: input.postUrl,
          externalPostId: null,
          source: 'MANUAL',
          manualMetrics: Prisma.JsonNull,
          idempotencyKey: input.idempotencyKey,
        },
      });
      const activity = await tx.missionActivity.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          type: 'POSTED',
          occurredAt: input.postedAt,
          idempotencyKey: input.idempotencyKey,
          metadata: Prisma.JsonNull,
        },
      });
      return { post: postRecord(post), activity: missionActivity(activity) };
    });
  }
  async getFeedback(input: Parameters<MissionOutcomeRepository['getFeedback']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.client.missionFeedback.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
      },
    });
    return value ? missionFeedback(value) : null;
  }
  async recordFeedback(input: Parameters<MissionOutcomeRepository['recordFeedback']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      if (
        !(await tx.postRecord.findFirst({
          where: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
          },
        }))
      )
        return null;
      const type = `FEEDBACK_${input.rating}` as const;
      const existingActivity = await this.activityByKey(tx, input);
      if (existingActivity) {
        if (
          existingActivity.dailyMissionId !== input.dailyMissionId ||
          existingActivity.type !== type
        )
          throw new ApplicationError('CONFLICT', 'idempotency key was already used');
        const feedback = await tx.missionFeedback.findUniqueOrThrow({
          where: { dailyMissionId: input.dailyMissionId },
        });
        return { feedback: missionFeedback(feedback), activity: missionActivity(existingActivity) };
      }
      const feedback = await tx.missionFeedback.upsert({
        where: { dailyMissionId: input.dailyMissionId },
        create: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          rating: input.rating,
        },
        update: { actorUserId: input.actorUserId, rating: input.rating },
      });
      const activity = await tx.missionActivity.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          type,
          idempotencyKey: input.idempotencyKey,
          metadata: Prisma.JsonNull,
        },
      });
      return { feedback: missionFeedback(feedback), activity: missionActivity(activity) };
    });
  }
}
