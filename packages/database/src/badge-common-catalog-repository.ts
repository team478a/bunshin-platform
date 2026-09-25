import { Prisma, type PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import type { CommonBadgeCandidate, CommonBadgeProcessorRepository } from '@bunshin/application';

export class PrismaCommonBadgeCatalogRepository {
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
}
