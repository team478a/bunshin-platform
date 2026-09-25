import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  calculateBadgeStreak,
  type CommonBadgeCandidate,
  type CommonBadgeProcessResult,
} from '@bunshin/application';
import { badgeActivityDates, badgeSourceMatches } from './badge-common-activity';
import { hasActiveRewardsPilotAccess } from './rewards-pilot-access';

export class PrismaCommonBadgeAwardProcessor {
  constructor(private readonly client: PrismaClient) {}

  async process(
    input: CommonBadgeCandidate & { timezone: string },
  ): Promise<CommonBadgeProcessResult> {
    return this.processCandidate(input, false);
  }

  private async processCandidate(
    input: CommonBadgeCandidate & { timezone: string },
    force: boolean,
  ): Promise<CommonBadgeProcessResult> {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const member = await tx.workspaceMembership.findFirst({
            where: {
              workspaceId: input.workspaceId,
              userId: input.userId,
              status: 'ACTIVE',
              workspace: { status: 'ACTIVE' },
              user: { status: 'ACTIVE' },
            },
            select: { id: true },
          });
          if (!member) return 'NOT_ELIGIBLE';
          const prior = await tx.badgeProcessingEvent.findUnique({
            where: {
              workspaceId_eventType_sourceEventId: {
                workspaceId: input.workspaceId,
                eventType: input.eventType,
                sourceEventId: input.sourceEventId,
              },
            },
          });
          if (prior?.status === 'COMPLETED' && !force) return 'ALREADY_PROCESSED';
          const processing = prior
            ? await tx.badgeProcessingEvent.update({
                where: { id: prior.id },
                data: { status: 'PROCESSING', failureCode: null, processedAt: null },
              })
            : await tx.badgeProcessingEvent.create({
                data: {
                  workspaceId: input.workspaceId,
                  userId: input.userId,
                  eventType: input.eventType,
                  sourceEventId: input.sourceEventId,
                },
              });
          if (!(await badgeSourceMatches(tx, input))) {
            await tx.badgeProcessingEvent.update({
              where: { id: processing.id },
              data: { status: 'COMPLETED', processedAt: new Date() },
            });
            return 'NOT_ELIGIBLE';
          }
          const source = await tx.bunshin.findFirst({
            where: {
              id: input.sourceBunshinId ?? '',
              workspaceId: input.workspaceId,
              ownerUserId: input.userId,
            },
            select: { groupId: true },
          });
          const groupId = source?.groupId ?? null;
          if (
            groupId &&
            !(await hasActiveRewardsPilotAccess(
              tx,
              { workspaceId: input.workspaceId, groupId, userId: input.userId },
              input.occurredAt,
            ))
          ) {
            await tx.badgeProcessingEvent.update({
              where: { id: processing.id },
              data: {
                status: 'COMPLETED',
                failureCode: 'REWARDS_PILOT_UNAVAILABLE',
                processedAt: new Date(),
              },
            });
            return 'NOT_ELIGIBLE';
          }
          const definitions = await tx.badgeDefinition.findMany({
            where: { ownerType: 'SYSTEM', status: 'ACTIVE', workspaceId: null, groupId: null },
            include: {
              versions: {
                where: {
                  publishedAt: { not: null, lte: input.occurredAt },
                  OR: [{ startsAt: null }, { startsAt: { lte: input.occurredAt } }],
                  AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.occurredAt } }] }],
                },
                orderBy: { version: 'desc' },
                take: 1,
              },
            },
          });
          const matching = definitions
            .map((definition) => ({ definition, version: definition.versions[0] }))
            .filter(
              ({ version }) =>
                (version?.conditionConfig as { eventType?: string } | undefined)?.eventType ===
                input.eventType,
            );
          if (!matching.length) {
            await tx.badgeProcessingEvent.update({
              where: { id: processing.id },
              data: { status: 'COMPLETED', processedAt: new Date() },
            });
            return 'NO_ACTIVE_BADGE';
          }
          const dates = await badgeActivityDates(
            tx,
            input.workspaceId,
            input.userId,
            input.eventType,
            input.occurredAt,
          );
          let awarded = false,
            progressed = false;
          for (const { definition, version } of matching) {
            if (!version) continue;
            const target = Number((version.conditionConfig as { target?: number }).target);
            if (!Number.isSafeInteger(target) || target < 1) continue;
            const value =
              version.conditionType === 'FIRST'
                ? Math.min(dates.length, 1)
                : version.conditionType === 'STREAK_DAILY'
                  ? calculateBadgeStreak(dates, 'DAILY', input.timezone)
                  : version.conditionType === 'STREAK_WEEKLY'
                    ? calculateBadgeStreak(dates, 'WEEKLY', input.timezone)
                    : 0;
            const existingAward = await tx.badgeAward.findUnique({
              where: {
                workspaceId_userId_badgeVersionId: {
                  workspaceId: input.workspaceId,
                  userId: input.userId,
                  badgeVersionId: version.id,
                },
              },
            });
            const eligible = value >= target;
            await tx.badgeProgress.upsert({
              where: {
                workspaceId_userId_badgeVersionId: {
                  workspaceId: input.workspaceId,
                  userId: input.userId,
                  badgeVersionId: version.id,
                },
              },
              create: {
                workspaceId: input.workspaceId,
                userId: input.userId,
                badgeVersionId: version.id,
                currentValue: Math.min(value, target),
                targetValue: target,
                streakState: { timezone: input.timezone },
                status: existingAward ? 'AWARDED' : eligible ? 'ELIGIBLE' : 'IN_PROGRESS',
                lastEventAt: input.occurredAt,
              },
              update: {
                currentValue: Math.min(value, target),
                targetValue: target,
                streakState: { timezone: input.timezone },
                status: existingAward ? 'AWARDED' : eligible ? 'ELIGIBLE' : 'IN_PROGRESS',
                lastEventAt: input.occurredAt,
                revision: { increment: 1 },
              },
            });
            progressed = true;
            if (eligible && !existingAward) {
              const evidenceHash = createHash('sha256')
                .update(
                  `${input.workspaceId}:${input.userId}:${input.eventType}:${input.sourceEventId}:${definition.code}:v${version.version}`,
                )
                .digest('hex');
              await tx.badgeAward.create({
                data: {
                  workspaceId: input.workspaceId,
                  userId: input.userId,
                  badgeVersionId: version.id,
                  sourceBunshinId: input.sourceBunshinId,
                  awardedAt: input.occurredAt,
                  sourceType: input.eventType,
                  sourceId: input.sourceEventId,
                  evidenceHash,
                  idempotencyKey: `common:${definition.code}:v${version.version}`,
                },
              });
              await tx.badgeProgress.update({
                where: {
                  workspaceId_userId_badgeVersionId: {
                    workspaceId: input.workspaceId,
                    userId: input.userId,
                    badgeVersionId: version.id,
                  },
                },
                data: { status: 'AWARDED', revision: { increment: 1 } },
              });
              awarded = true;
            }
          }
          await tx.badgeProcessingEvent.update({
            where: { id: processing.id },
            data: { status: 'COMPLETED', failureCode: null, processedAt: new Date() },
          });
          return awarded ? 'AWARDED' : progressed ? 'PROGRESSED' : 'NOT_ELIGIBLE';
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return 'ALREADY_PROCESSED';
      await this.client.badgeProcessingEvent.upsert({
        where: {
          workspaceId_eventType_sourceEventId: {
            workspaceId: input.workspaceId,
            eventType: input.eventType,
            sourceEventId: input.sourceEventId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          userId: input.userId,
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

  async recalculate(input: { workspaceId: string; userId: string; timezone: string }) {
    const [bunshin, strategy, viewed, accepted, posted, feedback, image] = await Promise.all([
      this.client.bunshin.findFirst({
        where: {
          workspaceId: input.workspaceId,
          ownerUserId: input.userId,
          status: { not: 'ARCHIVED' },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.client.socialAccountStrategy.findFirst({
        where: {
          workspaceId: input.workspaceId,
          status: 'APPROVED',
          approvedAt: { not: null },
          bunshin: { ownerUserId: input.userId },
        },
        orderBy: { approvedAt: 'desc' },
      }),
      this.client.missionActivity.findFirst({
        where: { workspaceId: input.workspaceId, actorUserId: input.userId, type: 'VIEWED' },
        orderBy: { occurredAt: 'desc' },
      }),
      this.client.missionDecision.findFirst({
        where: {
          workspaceId: input.workspaceId,
          decision: 'ACCEPTED',
          decidedAt: { not: null },
          bunshin: { ownerUserId: input.userId },
        },
        orderBy: { decidedAt: 'desc' },
      }),
      this.client.postRecord.findFirst({
        where: { workspaceId: input.workspaceId, actorUserId: input.userId },
        orderBy: { postedAt: 'desc' },
      }),
      this.client.missionFeedback.findFirst({
        where: { workspaceId: input.workspaceId, actorUserId: input.userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.client.socialImageGeneratedMedia.findFirst({
        where: { workspaceId: input.workspaceId, ownerUserId: input.userId, status: 'READY' },
        include: { request: { select: { bunshinId: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const candidates: CommonBadgeCandidate[] = [];
    if (bunshin)
      candidates.push({
        workspaceId: input.workspaceId,
        userId: input.userId,
        sourceBunshinId: bunshin.id,
        eventType: 'BUNSHIN_CREATED',
        sourceEventId: bunshin.id,
        occurredAt: bunshin.createdAt,
      });
    if (strategy?.approvedAt)
      candidates.push({
        workspaceId: input.workspaceId,
        userId: input.userId,
        sourceBunshinId: strategy.bunshinId,
        eventType: 'STRATEGY_APPROVED',
        sourceEventId: strategy.id,
        occurredAt: strategy.approvedAt,
      });
    if (viewed)
      candidates.push({
        workspaceId: input.workspaceId,
        userId: input.userId,
        sourceBunshinId: viewed.bunshinId,
        eventType: 'MISSION_VIEWED',
        sourceEventId: viewed.id,
        occurredAt: viewed.occurredAt,
      });
    if (accepted?.decidedAt)
      candidates.push({
        workspaceId: input.workspaceId,
        userId: input.userId,
        sourceBunshinId: accepted.bunshinId,
        eventType: 'MISSION_ACCEPTED',
        sourceEventId: accepted.id,
        occurredAt: accepted.decidedAt,
      });
    if (posted)
      candidates.push({
        workspaceId: input.workspaceId,
        userId: input.userId,
        sourceBunshinId: posted.bunshinId,
        eventType: 'POSTED',
        sourceEventId: posted.id,
        occurredAt: posted.postedAt,
      });
    if (feedback)
      candidates.push({
        workspaceId: input.workspaceId,
        userId: input.userId,
        sourceBunshinId: feedback.bunshinId,
        eventType: 'FEEDBACK_RECORDED',
        sourceEventId: feedback.id,
        occurredAt: feedback.createdAt,
      });
    if (image)
      candidates.push({
        workspaceId: input.workspaceId,
        userId: input.userId,
        sourceBunshinId: image.request.bunshinId,
        eventType: 'IMAGE_COMPLETED',
        sourceEventId: image.id,
        occurredAt: image.createdAt,
      });
    let awarded = 0,
      progressed = 0;
    for (const candidate of candidates) {
      const result = await this.processCandidate({ ...candidate, timezone: input.timezone }, true);
      if (result === 'AWARDED') awarded += 1;
      if (result === 'PROGRESSED') progressed += 1;
    }
    return { scanned: candidates.length, awarded, progressed };
  }
}
