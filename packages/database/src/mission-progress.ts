import type {
  AchievementBadge,
  AchievementBadgeRepository,
  MissionActivity,
  MissionDecision,
  MissionEngagementRepository,
  MissionFeedback,
  MissionOutcomeRepository,
  PostRecord,
} from '@bunshin/capability-social';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';
function missionDecision(row: Prisma.MissionDecisionGetPayload<object>): MissionDecision {
  return row;
}
function missionActivity(row: Prisma.MissionActivityGetPayload<object>): MissionActivity {
  return {
    ...row,
    metadata: row.metadata as Record<string, unknown> | null,
  };
}
export class PrismaMissionEngagementRepository implements MissionEngagementRepository {
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
    });
  }
  private existingActivity(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      bunshinId: string;
      actorUserId: string;
      idempotencyKey: string;
    },
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
  private assertSameEvent(
    value: Prisma.MissionActivityGetPayload<object>,
    input: { dailyMissionId: string; type: string; metadata?: Record<string, unknown> | null },
  ) {
    const metadata = (value.metadata ?? null) as Record<string, unknown> | null;
    if (
      value.dailyMissionId !== input.dailyMissionId ||
      value.type !== input.type ||
      JSON.stringify(metadata) !== JSON.stringify(input.metadata ?? null)
    )
      throw new ApplicationError('CONFLICT', 'idempotency key was already used');
    return missionActivity(value);
  }
  async getDecision(input: Parameters<MissionEngagementRepository['getDecision']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.client.missionDecision.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
      },
    });
    return value ? missionDecision(value) : null;
  }
  async decide(input: Parameters<MissionEngagementRepository['decide']>[0]) {
    const type = input.decision;
    const operation = async () =>
      this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        if (!(await this.mission(tx, input))) return null;
        const existing = await this.existingActivity(tx, input);
        if (existing) {
          const activity = this.assertSameEvent(existing, { ...input, type, metadata: null });
          const decision = await tx.missionDecision.findUniqueOrThrow({
            where: { dailyMissionId: input.dailyMissionId },
          });
          return { decision: missionDecision(decision), activity };
        }
        const now = new Date();
        const decision = await tx.missionDecision.update({
          where: { dailyMissionId: input.dailyMissionId },
          data: {
            decision: input.decision,
            rejectionReason: input.rejectionReason,
            rejectionDetail: input.rejectionDetail,
            decidedAt: now,
          },
        });
        const activity = await tx.missionActivity.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
            actorUserId: input.actorUserId,
            type,
            occurredAt: now,
            idempotencyKey: input.idempotencyKey,
            metadata: Prisma.JsonNull,
          },
        });
        return { decision: missionDecision(decision), activity: missionActivity(activity) };
      });
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.existingActivity(this.client, input);
      if (!existing) throw error;
      const activity = this.assertSameEvent(existing, { ...input, type, metadata: null });
      const decision = await this.client.missionDecision.findUniqueOrThrow({
        where: { dailyMissionId: input.dailyMissionId },
      });
      return { decision: missionDecision(decision), activity };
    }
  }
  async listActivities(input: Parameters<MissionEngagementRepository['listActivities']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    if (!(await this.mission(this.client, input))) return null;
    return (
      await this.client.missionActivity.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      })
    ).map(missionActivity);
  }
  async appendActivity(input: Parameters<MissionEngagementRepository['appendActivity']>[0]) {
    const operation = async () =>
      this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        if (!(await this.mission(tx, input))) return null;
        const existing = await this.existingActivity(tx, input);
        if (existing) return this.assertSameEvent(existing, input);
        return missionActivity(
          await tx.missionActivity.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              dailyMissionId: input.dailyMissionId,
              actorUserId: input.actorUserId,
              type: input.type,
              idempotencyKey: input.idempotencyKey,
              metadata:
                input.metadata === null
                  ? Prisma.JsonNull
                  : (input.metadata as Prisma.InputJsonValue),
            },
          }),
        );
      });
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.existingActivity(this.client, input);
      if (!existing) throw error;
      return this.assertSameEvent(existing, input);
    }
  }
  async listProgressDays(input: Parameters<MissionEngagementRepository['listProgressDays']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    return (
      await this.client.dailyMission.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          missionDate: {
            ...(input.from === null ? {} : { gte: new Date(`${input.from}T00:00:00.000Z`) }),
            lte: new Date(`${input.to}T00:00:00.000Z`),
          },
          OR: [
            { campaignId: null },
            {
              campaign: {
                group: {
                  status: 'ACTIVE',
                  memberships: {
                    some: { userId: input.actorUserId, status: 'ACTIVE' },
                  },
                },
                participations: {
                  some: {
                    participantWorkspaceId: input.workspaceId,
                    userId: input.actorUserId,
                    bunshinId: input.bunshinId,
                    status: 'ACCEPTED',
                  },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          missionDate: true,
          activities: {
            where: { actorUserId: input.actorUserId },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ missionDate: 'asc' }, { id: 'asc' }],
      })
    ).map((value) => ({
      dailyMissionId: value.id,
      missionDate: value.missionDate.toISOString().slice(0, 10),
      activities: value.activities.map(missionActivity),
    }));
  }
}

function achievementBadge(row: Prisma.AchievementBadgeGetPayload<object>): AchievementBadge {
  return row;
}

export class PrismaAchievementBadgeRepository implements AchievementBadgeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async authorized(input: { workspaceId: string; userId: string; bunshinId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.userId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }

  async list(input: Parameters<AchievementBadgeRepository['list']>[0]) {
    if (!(await this.authorized(input))) return null;
    return (
      await this.client.achievementBadge.findMany({
        where: input,
        orderBy: [{ awardedAt: 'asc' }, { id: 'asc' }],
      })
    ).map(achievementBadge);
  }

  async award(input: Parameters<AchievementBadgeRepository['award']>[0]) {
    if (!(await this.authorized(input))) return null;
    return achievementBadge(
      await this.client.achievementBadge.upsert({
        where: {
          workspaceId_userId_bunshinId_featureKey_badgeKey_ruleVersion: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            bunshinId: input.bunshinId,
            featureKey: input.featureKey,
            badgeKey: input.badgeKey,
            ruleVersion: input.ruleVersion,
          },
        },
        create: input,
        update: {},
      }),
    );
  }
}

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
