import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

export class PrismaCommonBadgeLegacyMigrator {
  constructor(private readonly client: PrismaClient) {}

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
