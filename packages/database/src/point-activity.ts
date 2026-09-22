import type {
  PointActivityCandidate,
  PointActivityProcessorRepository,
  PointActivityProcessResult,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
import { applyPointCreditToAccount } from './point-account';
import { pointDayKey, pointWeekKey } from './point-records';
import { hasActiveRewardsPilotAccess } from './rewards-pilot-access';

const pointExpiry = (value: Date) => {
  const after180Days = new Date(value.getTime() + 180 * 24 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(after180Days.getUTCFullYear(), after180Days.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
};

export class PrismaPointActivityProcessorRepository implements PointActivityProcessorRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listCandidates(input: { limit: number }): Promise<PointActivityCandidate[]> {
    const rows = await this.client.$queryRaw<
      Array<{
        workspaceId: string;
        actorUserId: string;
        eventType: PointActivityCandidate['eventType'];
        sourceEventId: string;
        occurredAt: Date;
      }>
    >(Prisma.sql`
      SELECT candidate."workspaceId", candidate."actorUserId", candidate."eventType",
             candidate."sourceEventId", candidate."occurredAt"
      FROM (
        SELECT activity."workspace_id" AS "workspaceId",
               activity."actor_user_id" AS "actorUserId",
               'MISSION_VIEWED'::text AS "eventType",
               activity."id" AS "sourceEventId",
               activity."occurred_at" AS "occurredAt"
        FROM "mission_activities" activity
        WHERE activity."type" = 'VIEWED'
        UNION ALL
        SELECT post."workspace_id", post."actor_user_id", 'POSTED'::text,
               post."id", post."posted_at"
        FROM "post_records" post
      ) candidate
      WHERE NOT EXISTS (
        SELECT 1 FROM "point_processing_events" processed
        WHERE processed."workspace_id" = candidate."workspaceId"
          AND processed."event_type" = candidate."eventType"
          AND processed."source_event_id" = candidate."sourceEventId"::text
          AND processed."status" = 'COMPLETED'
      )
      ORDER BY candidate."occurredAt" ASC, candidate."sourceEventId" ASC
      LIMIT ${input.limit}
    `);
    return rows;
  }

  async process(
    input: PointActivityCandidate & { timezone: string },
  ): Promise<PointActivityProcessResult> {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const membership = await tx.workspaceMembership.findFirst({
            where: {
              workspaceId: input.workspaceId,
              userId: input.actorUserId,
              status: 'ACTIVE',
              workspace: { status: 'ACTIVE' },
              user: { status: 'ACTIVE' },
            },
            select: { id: true },
          });
          if (!membership) return 'NOT_ELIGIBLE';
          const previousProcessing = await tx.pointProcessingEvent.findUnique({
            where: {
              workspaceId_eventType_sourceEventId: {
                workspaceId: input.workspaceId,
                eventType: input.eventType,
                sourceEventId: input.sourceEventId,
              },
            },
          });
          if (previousProcessing?.status === 'COMPLETED') return 'ALREADY_PROCESSED';
          const processing = previousProcessing
            ? await tx.pointProcessingEvent.update({
                where: { id: previousProcessing.id },
                data: { status: 'PROCESSING', failureCode: null, processedAt: null },
              })
            : await tx.pointProcessingEvent.create({
                data: {
                  workspaceId: input.workspaceId,
                  userId: input.actorUserId,
                  eventType: input.eventType,
                  sourceEventId: input.sourceEventId,
                },
              });
          let groupId: string | null = null;
          let campaignId: string | null = null;
          if (input.eventType === 'MISSION_VIEWED') {
            const event = await tx.missionActivity.findFirst({
              where: {
                id: input.sourceEventId,
                workspaceId: input.workspaceId,
                actorUserId: input.actorUserId,
                type: 'VIEWED',
              },
              select: {
                occurredAt: true,
                dailyMission: {
                  select: { campaignId: true, bunshin: { select: { groupId: true } } },
                },
              },
            });
            if (!event) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: { status: 'COMPLETED', processedAt: new Date() },
              });
              return 'NOT_ELIGIBLE';
            }
            campaignId = event.dailyMission.campaignId;
            groupId = event.dailyMission.bunshin.groupId;
          } else {
            const event = await tx.postRecord.findFirst({
              where: {
                id: input.sourceEventId,
                workspaceId: input.workspaceId,
                actorUserId: input.actorUserId,
              },
              select: {
                postedAt: true,
                dailyMission: {
                  select: { campaignId: true, bunshin: { select: { groupId: true } } },
                },
              },
            });
            if (!event) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: { status: 'COMPLETED', processedAt: new Date() },
              });
              return 'NOT_ELIGIBLE';
            }
            campaignId = event.dailyMission.campaignId;
            groupId = event.dailyMission.bunshin.groupId;
          }
          if (campaignId) {
            const campaign = await tx.campaign.findFirst({
              where: { id: campaignId, workspaceId: input.workspaceId },
              select: { groupId: true },
            });
            if (!campaign) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: { status: 'COMPLETED', processedAt: new Date() },
              });
              return 'NOT_ELIGIBLE';
            }
            groupId = campaign.groupId;
          }
          if (groupId) {
            const pilotEnabled = await hasActiveRewardsPilotAccess(
              tx,
              {
                workspaceId: input.workspaceId,
                groupId,
                userId: input.actorUserId,
              },
              input.occurredAt,
            );
            if (!pilotEnabled) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: {
                  status: 'COMPLETED',
                  failureCode: 'REWARDS_PILOT_UNAVAILABLE',
                  processedAt: new Date(),
                },
              });
              return 'NOT_ELIGIBLE';
            }
            const pointControl = await tx.serviceConfiguration.findFirst({
              where: { workspaceId: input.workspaceId, groupId },
              select: { pointIssuanceStopped: true },
            });
            if (pointControl?.pointIssuanceStopped) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: {
                  status: 'COMPLETED',
                  failureCode: 'POINT_ISSUANCE_STOPPED',
                  processedAt: new Date(),
                },
              });
              return 'NO_ACTIVE_RULE';
            }
          }
          const dayKey = pointDayKey(input.occurredAt, input.timezone);
          const weekKey = pointWeekKey(input.occurredAt, input.timezone);
          const servicePeriod = groupId ? `:group:${groupId}` : '';
          const ruleRequests =
            input.eventType === 'MISSION_VIEWED'
              ? [
                  {
                    key: 'MISSION_VIEWED_DAILY',
                    period: `day:${dayKey}${servicePeriod}`,
                    legacyPeriod: `day:${dayKey}`,
                    eligible: true,
                  },
                ]
              : [
                  {
                    key: 'POSTED_DAILY',
                    period: `day:${dayKey}${servicePeriod}`,
                    legacyPeriod: `day:${dayKey}`,
                    eligible: true,
                  },
                  {
                    key: 'POSTED_WEEKLY_3',
                    period: `week:${weekKey}${servicePeriod}`,
                    legacyPeriod: `week:${weekKey}`,
                    eligible: await this.hasThreePostsInWeek(
                      tx,
                      input.workspaceId,
                      groupId,
                      input.actorUserId,
                      weekKey,
                      input.timezone,
                      input.occurredAt,
                    ),
                  },
                ];
          let granted = false;
          let activeRuleFound = false;
          const account = await tx.pointAccount.upsert({
            where: {
              workspaceId_userId: {
                workspaceId: input.workspaceId,
                userId: input.actorUserId,
              },
            },
            create: { workspaceId: input.workspaceId, userId: input.actorUserId },
            update: {},
          });
          for (const request of ruleRequests) {
            if (!request.eligible) continue;
            const rules = await tx.pointRuleVersion.findMany({
              where: {
                ruleKey: request.key,
                status: { in: ['ACTIVE', 'SUSPENDED'] },
                OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
                AND: [
                  { OR: [{ groupId: null }, { groupId }] },
                  { OR: [{ campaignId: null }, { campaignId }] },
                  { OR: [{ startsAt: null }, { startsAt: { lte: input.occurredAt } }] },
                  { OR: [{ endsAt: null }, { endsAt: { gt: input.occurredAt } }] },
                ],
              },
              orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
            });
            const rule = rules.sort(
              (left, right) =>
                Number(Boolean(right.campaignId)) - Number(Boolean(left.campaignId)) ||
                Number(Boolean(right.groupId)) - Number(Boolean(left.groupId)) ||
                Number(Boolean(right.workspaceId)) - Number(Boolean(left.workspaceId)),
            )[0];
            if (!rule) continue;
            if (rule.status === 'SUSPENDED') continue;
            activeRuleFound = true;
            const idempotencyKey = `rule:${rule.id}:${request.period}`;
            const legacyIdempotencyKey = `rule:${rule.id}:${request.legacyPeriod}`;
            const existing = await tx.pointTransaction.findFirst({
              where: {
                accountId: account.id,
                OR: [
                  { idempotencyKey },
                  ...(groupId && legacyIdempotencyKey !== idempotencyKey
                    ? [{ idempotencyKey: legacyIdempotencyKey, groupId }]
                    : []),
                ],
              },
              select: { id: true },
            });
            if (existing) continue;
            const budget = await tx.pointRuleBudget.findUnique({
              where: { ruleVersionId: rule.id },
            });
            if (budget) {
              const reserved = await tx.pointRuleBudget.updateMany({
                where: {
                  id: budget.id,
                  grantedPoints: budget.grantedPoints,
                  maximumPoints: { gte: budget.grantedPoints + rule.grantAmount },
                },
                data: { grantedPoints: { increment: rule.grantAmount } },
              });
              if (reserved.count !== 1) continue;
            }
            const transaction = await tx.pointTransaction.create({
              data: {
                accountId: account.id,
                workspaceId: input.workspaceId,
                userId: input.actorUserId,
                groupId,
                campaignId,
                ruleVersionId: rule.id,
                type: 'GRANT',
                amount: rule.grantAmount,
                idempotencyKey,
                sourceType: input.eventType,
                sourceId: input.sourceEventId,
                expiresAt: pointExpiry(input.occurredAt),
              },
            });
            await applyPointCreditToAccount(tx, {
              accountId: account.id,
              transactionId: transaction.id,
              amount: rule.grantAmount,
            });
            granted = true;
          }
          await tx.pointProcessingEvent.update({
            where: { id: processing.id },
            data: { status: 'COMPLETED', processedAt: new Date(), failureCode: null },
          });
          if (granted) return 'GRANTED';
          return activeRuleFound ? 'NOT_ELIGIBLE' : 'NO_ACTIVE_RULE';
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return 'ALREADY_PROCESSED';
      await this.client.pointProcessingEvent.upsert({
        where: {
          workspaceId_eventType_sourceEventId: {
            workspaceId: input.workspaceId,
            eventType: input.eventType,
            sourceEventId: input.sourceEventId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          eventType: input.eventType,
          sourceEventId: input.sourceEventId,
          status: 'FAILED',
          failureCode: 'PROCESSOR_ERROR',
        },
        update: { status: 'FAILED', failureCode: 'PROCESSOR_ERROR' },
      });
      throw error;
    }
  }

  private async hasThreePostsInWeek(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    groupId: string | null,
    userId: string,
    weekKey: string,
    timezone: string,
    occurredAt: Date,
  ) {
    const posts = await tx.postRecord.findMany({
      where: {
        workspaceId,
        actorUserId: userId,
        ...(groupId ? { bunshin: { groupId } } : {}),
        postedAt: {
          gte: new Date(occurredAt.getTime() - 7 * 24 * 60 * 60 * 1000),
          lte: new Date(occurredAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      select: { postedAt: true },
    });
    return posts.filter((post) => pointWeekKey(post.postedAt, timezone) === weekKey).length >= 3;
  }
}
