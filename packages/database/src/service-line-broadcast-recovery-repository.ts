import type {
  RecoverableServiceLineBroadcast,
  ServiceLineBroadcastRecoveryRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { type PrismaClient, prisma } from './client';

export class PrismaServiceLineBroadcastRecoveryRepository implements ServiceLineBroadcastRecoveryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listUnqueued(input: Parameters<ServiceLineBroadcastRecoveryRepository['listUnqueued']>[0]) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid broadcast recovery limit');
    const rows = await this.client.$queryRaw<RecoverableServiceLineBroadcast[]>`
      SELECT
        broadcast."workspace_id" AS "workspaceId",
        broadcast."id" AS "broadcastId",
        broadcast."updated_by_user_id" AS "requestedBy",
        broadcast."scheduled_at" AS "scheduledAt",
        broadcast."updated_at" AS "updatedAt"
      FROM "service_line_broadcasts" broadcast
      JOIN "workspaces" workspace ON workspace."id" = broadcast."workspace_id"
      WHERE broadcast."status" = 'SCHEDULED'
        AND broadcast."scheduled_at" IS NOT NULL
        AND workspace."status" = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1
          FROM "jobs" job
          WHERE job."environment" = ${input.environment}::"LineConfigurationEnvironment"
            AND job."workspace_id" = broadcast."workspace_id"
            AND job."payload_reference" = ('service-line-broadcast:' || broadcast."id"::text)
            AND (
              job."status" IN ('PENDING', 'LEASED', 'RETRY_SCHEDULED')
              OR job."idempotency_key" LIKE
                ('service-line-broadcast-recovery:' || broadcast."id"::text || ':%')
            )
        )
      ORDER BY broadcast."scheduled_at" ASC, broadcast."id" ASC
      LIMIT ${input.limit + 1}
    `;
    return {
      candidates: rows.slice(0, input.limit),
      truncated: rows.length > input.limit,
    };
  }
}
