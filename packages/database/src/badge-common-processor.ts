import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ApplicationError } from '@bunshin/shared';
import {
  calculateBadgeStreak,
  type CommonBadgeCandidate,
  type CommonBadgeProcessorRepository,
  type CommonBadgeProcessResult,
} from '@bunshin/application';

export class PrismaCommonBadgeProcessorRepository implements CommonBadgeProcessorRepository {
  constructor(private readonly client: PrismaClient) {}

  async ensureCatalog(input: Parameters<CommonBadgeProcessorRepository['ensureCatalog']>[0]) {
    const administrator = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    if (!administrator) throw new ApplicationError('FORBIDDEN', 'badge catalog is not allowed');
    let created = 0,
      existing = 0;
    for (const item of input.catalog) {
      await this.client.$transaction(async (tx) => {
        const found = await tx.badgeDefinition.findFirst({
          where: { ownerType: 'SYSTEM', workspaceId: null, groupId: null, code: item.code },
        });
        if (found) {
          existing += 1;
          return;
        }
        const definition = await tx.badgeDefinition.create({
          data: {
            ownerType: 'SYSTEM',
            code: item.code,
            category: item.category,
            status: 'ACTIVE',
            currentVersion: 1,
          },
        });
        await tx.badgeVersion.create({
          data: {
            definitionId: definition.id,
            version: 1,
            title: item.title,
            description: item.description,
            imageKey: `badges/${item.code.toLowerCase()}.svg`,
            altText: item.title,
            conditionType: item.conditionType,
            conditionConfig: {
              schemaVersion: 1,
              eventType: item.eventType,
              target: item.target,
              timezonePolicy: 'USER_OR_ASIA_TOKYO',
              weekStartsOn: 'MONDAY',
            },
            visibilityPolicy: 'PRIVATE',
            rewardPolicy: { type: 'NONE' },
            publishedAt: input.publishedAt,
          },
        });
        await tx.badgeAdminAuditLog.create({
          data: {
            badgeDefinitionId: definition.id,
            action: 'COMMON_CATALOG_SEEDED',
            afterData: { code: item.code, version: 1 },
            reason: '承認済み初期共通バッジCatalogの登録',
            performedByUserId: input.actorUserId,
          },
        });
        created += 1;
      });
    }
    return { created, existing };
  }

  async listCandidates(input: { limit: number }): Promise<CommonBadgeCandidate[]> {
    return this.client.$queryRaw<CommonBadgeCandidate[]>(Prisma.sql`
      SELECT c."workspaceId", c."userId", c."sourceBunshinId", c."eventType", c."sourceEventId", c."occurredAt"
      FROM (
        SELECT b."workspace_id" "workspaceId", b."owner_user_id" "userId", b."id" "sourceBunshinId", 'BUNSHIN_CREATED'::text "eventType", b."id" "sourceEventId", b."created_at" "occurredAt"
        FROM "bunshins" b WHERE b."status" <> 'ARCHIVED'
        UNION ALL SELECT s."workspace_id", b."owner_user_id", s."bunshin_id", 'STRATEGY_APPROVED'::text, s."id", s."approved_at"
        FROM "social_account_strategies" s JOIN "bunshins" b ON b."workspace_id"=s."workspace_id" AND b."id"=s."bunshin_id"
        WHERE s."status"='APPROVED' AND s."approved_at" IS NOT NULL
        UNION ALL SELECT a."workspace_id", a."actor_user_id", a."bunshin_id", 'MISSION_VIEWED'::text, a."id", a."occurred_at"
        FROM "mission_activities" a WHERE a."type"='VIEWED'
        UNION ALL SELECT d."workspace_id", b."owner_user_id", d."bunshin_id", 'MISSION_ACCEPTED'::text, d."id", d."decided_at"
        FROM "mission_decisions" d JOIN "bunshins" b ON b."workspace_id"=d."workspace_id" AND b."id"=d."bunshin_id"
        WHERE d."decision"='ACCEPTED' AND d."decided_at" IS NOT NULL
        UNION ALL SELECT p."workspace_id", p."actor_user_id", p."bunshin_id", 'POSTED'::text, p."id", p."posted_at" FROM "post_records" p
        UNION ALL SELECT f."workspace_id", f."actor_user_id", f."bunshin_id", 'FEEDBACK_RECORDED'::text, f."id", f."created_at" FROM "mission_feedback" f
        UNION ALL SELECT m."workspace_id", m."owner_user_id", r."bunshin_id", 'IMAGE_COMPLETED'::text, m."id", m."created_at"
        FROM "social_image_generated_media" m JOIN "social_image_generation_requests" r ON r."workspace_id"=m."workspace_id" AND r."id"=m."request_id"
        WHERE m."status"='READY'
      ) c
      WHERE c."occurredAt" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "badge_processing_events" p WHERE p."workspace_id"=c."workspaceId"
          AND p."event_type"=c."eventType" AND p."source_event_id"=c."sourceEventId"::text AND p."status"='COMPLETED'
      ) ORDER BY c."occurredAt", c."sourceEventId" LIMIT ${input.limit}
    `);
  }

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
          if (!(await this.sourceMatches(tx, input))) {
            await tx.badgeProcessingEvent.update({
              where: { id: processing.id },
              data: { status: 'COMPLETED', processedAt: new Date() },
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
          const dates = await this.activityDates(
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

  private async sourceMatches(
    tx: Prisma.TransactionClient,
    input: CommonBadgeCandidate,
  ): Promise<boolean> {
    const base = { id: input.sourceEventId, workspaceId: input.workspaceId };
    if (input.eventType === 'BUNSHIN_CREATED')
      return Boolean(
        await tx.bunshin.findFirst({
          where: { ...base, id: input.sourceBunshinId ?? '', ownerUserId: input.userId },
          select: { id: true },
        }),
      );
    if (input.eventType === 'STRATEGY_APPROVED')
      return Boolean(
        await tx.socialAccountStrategy.findFirst({
          where: {
            ...base,
            bunshinId: input.sourceBunshinId ?? '',
            status: 'APPROVED',
            bunshin: { ownerUserId: input.userId },
          },
          select: { id: true },
        }),
      );
    if (input.eventType === 'MISSION_VIEWED')
      return Boolean(
        await tx.missionActivity.findFirst({
          where: {
            ...base,
            bunshinId: input.sourceBunshinId ?? '',
            actorUserId: input.userId,
            type: 'VIEWED',
          },
          select: { id: true },
        }),
      );
    if (input.eventType === 'MISSION_ACCEPTED')
      return Boolean(
        await tx.missionDecision.findFirst({
          where: {
            ...base,
            bunshinId: input.sourceBunshinId ?? '',
            decision: 'ACCEPTED',
            bunshin: { ownerUserId: input.userId },
          },
          select: { id: true },
        }),
      );
    if (input.eventType === 'POSTED')
      return Boolean(
        await tx.postRecord.findFirst({
          where: {
            ...base,
            bunshinId: input.sourceBunshinId ?? '',
            actorUserId: input.userId,
          },
          select: { id: true },
        }),
      );
    if (input.eventType === 'FEEDBACK_RECORDED')
      return Boolean(
        await tx.missionFeedback.findFirst({
          where: {
            ...base,
            bunshinId: input.sourceBunshinId ?? '',
            actorUserId: input.userId,
          },
          select: { id: true },
        }),
      );
    return Boolean(
      await tx.socialImageGeneratedMedia.findFirst({
        where: {
          ...base,
          ownerUserId: input.userId,
          status: 'READY',
          request: { bunshinId: input.sourceBunshinId ?? '' },
        },
        select: { id: true },
      }),
    );
  }

  private async activityDates(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    userId: string,
    eventType: CommonBadgeCandidate['eventType'],
    through: Date,
  ): Promise<Date[]> {
    if (eventType === 'BUNSHIN_CREATED')
      return (
        await tx.bunshin.findMany({
          where: {
            workspaceId,
            ownerUserId: userId,
            createdAt: { lte: through },
            status: { not: 'ARCHIVED' },
          },
          select: { createdAt: true },
        })
      ).map((x) => x.createdAt);
    if (eventType === 'STRATEGY_APPROVED')
      return (
        await tx.socialAccountStrategy.findMany({
          where: {
            workspaceId,
            approvedAt: { not: null, lte: through },
            bunshin: { ownerUserId: userId },
          },
          select: { approvedAt: true },
        })
      ).flatMap((x) => (x.approvedAt ? [x.approvedAt] : []));
    if (eventType === 'MISSION_VIEWED')
      return (
        await tx.missionActivity.findMany({
          where: { workspaceId, actorUserId: userId, type: 'VIEWED', occurredAt: { lte: through } },
          select: { occurredAt: true },
        })
      ).map((x) => x.occurredAt);
    if (eventType === 'MISSION_ACCEPTED')
      return (
        await tx.missionDecision.findMany({
          where: {
            workspaceId,
            decision: 'ACCEPTED',
            decidedAt: { not: null, lte: through },
            bunshin: { ownerUserId: userId },
          },
          select: { decidedAt: true },
        })
      ).flatMap((x) => (x.decidedAt ? [x.decidedAt] : []));
    if (eventType === 'POSTED')
      return (
        await tx.postRecord.findMany({
          where: { workspaceId, actorUserId: userId, postedAt: { lte: through } },
          select: { postedAt: true },
        })
      ).map((x) => x.postedAt);
    if (eventType === 'FEEDBACK_RECORDED')
      return (
        await tx.missionFeedback.findMany({
          where: { workspaceId, actorUserId: userId, createdAt: { lte: through } },
          select: { createdAt: true },
        })
      ).map((x) => x.createdAt);
    return (
      await tx.socialImageGeneratedMedia.findMany({
        where: { workspaceId, ownerUserId: userId, status: 'READY', createdAt: { lte: through } },
        select: { createdAt: true },
      })
    ).map((x) => x.createdAt);
  }

  async migrateLegacy(input: { limit: number }) {
    const mapping: Record<string, string> = {
      FIRST_CONFIRMATION: 'FIRST_PLAN_VIEW',
      FIRST_POST: 'FIRST_POST',
    };
    const rows = await this.client.$queryRaw<
      Array<{
        id: string;
        workspaceId: string;
        userId: string;
        bunshinId: string;
        badgeKey: string;
        ruleVersion: number;
        awardedAt: Date;
      }>
    >(Prisma.sql`
      SELECT old."id", old."workspace_id" AS "workspaceId", old."user_id" AS "userId",
             old."bunshin_id" AS "bunshinId", old."badge_key" AS "badgeKey",
             old."rule_version" AS "ruleVersion", old."awarded_at" AS "awardedAt"
      FROM "achievement_badges" old
      WHERE old."badge_key" IN ('FIRST_CONFIRMATION', 'FIRST_POST')
        AND NOT EXISTS (
          SELECT 1 FROM "badge_processing_events" processed
          WHERE processed."workspace_id" = old."workspace_id"
            AND processed."event_type" = 'LEGACY_BADGE_MIGRATION'
            AND processed."source_event_id" = old."id"::text
            AND processed."status" = 'COMPLETED'
        )
      ORDER BY old."awarded_at", old."id"
      LIMIT ${input.limit}
    `);
    let migrated = 0,
      skipped = 0;
    for (const old of rows) {
      const code = mapping[old.badgeKey];
      if (!code) {
        skipped += 1;
        continue;
      }
      const version = await this.client.badgeVersion.findFirst({
        where: {
          definition: { ownerType: 'SYSTEM', code, status: 'ACTIVE' },
          publishedAt: { not: null },
        },
        orderBy: { version: 'desc' },
      });
      if (!version) {
        skipped += 1;
        continue;
      }
      const idempotencyKey = `legacy:achievement:${old.id}`;
      const exists = await this.client.badgeAward.findFirst({
        where: {
          workspaceId: old.workspaceId,
          userId: old.userId,
          OR: [{ badgeVersionId: version.id }, { idempotencyKey }],
        },
      });
      if (exists) {
        await this.markLegacyProcessed(old);
        skipped += 1;
        continue;
      }
      await this.client.badgeAward.create({
        data: {
          workspaceId: old.workspaceId,
          userId: old.userId,
          badgeVersionId: version.id,
          sourceBunshinId: old.bunshinId,
          awardedAt: old.awardedAt,
          sourceType: 'LEGACY_ACHIEVEMENT',
          sourceId: old.id,
          evidenceHash: createHash('sha256')
            .update(`achievement:${old.id}:${old.badgeKey}:${old.ruleVersion}`)
            .digest('hex'),
          idempotencyKey,
        },
      });
      await this.markLegacyProcessed(old);
      migrated += 1;
    }
    return { migrated, skipped };
  }

  private async markLegacyProcessed(input: { id: string; workspaceId: string; userId: string }) {
    await this.client.badgeProcessingEvent.upsert({
      where: {
        workspaceId_eventType_sourceEventId: {
          workspaceId: input.workspaceId,
          eventType: 'LEGACY_BADGE_MIGRATION',
          sourceEventId: input.id,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        eventType: 'LEGACY_BADGE_MIGRATION',
        sourceEventId: input.id,
        status: 'COMPLETED',
        processedAt: new Date(),
      },
      update: { status: 'COMPLETED', failureCode: null, processedAt: new Date() },
    });
  }
}
