import {
  IMPROVEMENT_FEEDBACK_RETENTION_JOB_TYPE,
  improvementFeedbackPurgePayload,
  type ImprovementFeedbackRetentionJobRepository,
  type Job,
  type JobEnvironment,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, prisma, type PrismaClient } from './client';
import { purgeExpiredImprovementFeedbackInTransaction } from './improvement-feedback-retention';

const day = 86_400_000;
const uuid = '[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}';
const payloadPattern = new RegExp(`^feedback-purge:feedback-retention-v1:(${uuid})$`, 'i');

const expiredScopesSql = (now: Date) => Prisma.sql`
  WITH expired AS (
    SELECT workspace_id, service_id, created_at + interval '90 days' AS due
    FROM improvement_feedback WHERE created_at <= ${new Date(now.getTime() - 90 * day)}
    UNION ALL
    SELECT workspace_id, service_id, expires_at AS due
    FROM improvement_triage_candidates WHERE expires_at <= ${now}
    UNION ALL
    SELECT workspace_id, service_id, expires_at AS due
    FROM improvement_triage_operations WHERE expires_at <= ${now}
  ), scopes AS (
    SELECT workspace_id, service_id, min(due) AS due FROM expired
    GROUP BY workspace_id, service_id
  )
`;

/** Trusted internal Cron composition only; never exposed as a user enqueue operation. */
export class PrismaImprovementFeedbackRetentionJobRepository implements ImprovementFeedbackRetentionJobRepository {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly now = () => new Date(),
  ) {}

  async schedule(environment: JobEnvironment) {
    if (!['DEVELOPMENT', 'STAGING', 'PRODUCTION'].includes(environment))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid retention environment');
    const now = new Date(this.now());
    if (!Number.isFinite(now.getTime()))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid retention clock');
    const dayKey = now.toISOString().slice(0, 10);
    // Original sources have no environment column: retention is physical ws/service scope,
    // not a license to infer or transfer environment-specific Candidate ownership.
    const selection = await this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
        const orphaned = await tx.$queryRaw<{ detected: boolean }[]>`
          ${expiredScopesSql(now)}
          SELECT EXISTS (
            SELECT 1 FROM scopes s JOIN groups g
              ON g.id = s.service_id AND g.workspace_id = s.workspace_id
            WHERE NOT EXISTS (SELECT 1 FROM workspace_memberships m
              WHERE m.workspace_id = s.workspace_id)
          ) AS detected
        `;
        if (typeof orphaned[0]?.detected !== 'boolean')
          throw new Error('feedback retention scope inspection unavailable');
        const scopes = await tx.$queryRaw<
          Array<{ workspaceId: string; serviceId: string; requestedBy: string }>
        >`
      ${expiredScopesSql(now)}
      SELECT s.workspace_id AS "workspaceId", s.service_id AS "serviceId",
             member.user_id AS "requestedBy"
      FROM scopes s JOIN groups g ON g.id = s.service_id AND g.workspace_id = s.workspace_id
      JOIN LATERAL (
        SELECT user_id FROM workspace_memberships WHERE workspace_id = s.workspace_id
        ORDER BY created_at, id LIMIT 1
      ) member ON true
      WHERE NOT EXISTS (
        SELECT 1 FROM jobs j WHERE j.environment = ${environment}::"LineConfigurationEnvironment"
          AND j.workspace_id = s.workspace_id AND j.job_type = ${IMPROVEMENT_FEEDBACK_RETENTION_JOB_TYPE}
          AND j.payload_reference = 'feedback-purge:feedback-retention-v1:' || s.service_id::text
          AND (j.status IN ('PENDING', 'LEASED', 'RETRY_SCHEDULED')
            OR j.idempotency_key = 'feedback-purge:feedback-retention-v1:' || s.service_id::text || ':' || ${dayKey})
      )
      ORDER BY s.due, s.workspace_id, s.service_id LIMIT 20
    `;
        return { scopes, orphanedScopesDetected: orphaned[0].detected };
      },
      { maxWait: 2_000, timeout: 3_000, isolationLevel: 'RepeatableRead' },
    );
    let scheduled = 0;
    const startedAt = Date.now();
    for (const scope of selection.scopes) {
      if (Date.now() - startedAt >= 5_000) break;
      const payload = improvementFeedbackPurgePayload(scope.serviceId);
      // Service lock also prevents concurrent midnight schedules from creating two
      // nonterminal Jobs with different daily keys. Ordinary enqueue is unchanged.
      const result = await this.client.$transaction(
        async (tx) => {
          const groups = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM groups
          WHERE workspace_id = ${scope.workspaceId}::uuid AND id = ${scope.serviceId}::uuid FOR UPDATE`;
          if (!groups.length) return { count: 0 };
          const existing = await tx.job.findFirst({
            where: {
              environment,
              workspaceId: scope.workspaceId,
              jobType: IMPROVEMENT_FEEDBACK_RETENTION_JOB_TYPE,
              payloadReference: payload,
              OR: [
                { status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED'] } },
                { idempotencyKey: `${payload}:${dayKey}` },
              ],
            },
            select: { id: true },
          });
          if (existing) return { count: 0 };
          return tx.job.createMany({
            data: {
              environment,
              workspaceId: scope.workspaceId,
              requestedBy: scope.requestedBy,
              jobType: IMPROVEMENT_FEEDBACK_RETENTION_JOB_TYPE,
              payloadReference: payload,
              idempotencyKey: `${payload}:${dayKey}`,
              correlationId: 'feedback-retention-v1',
              priority: 100,
              maxAttempts: 5,
              scheduledAt: now,
            },
            skipDuplicates: true,
          });
        },
        { maxWait: 2_000, timeout: 3_000 },
      );
      scheduled += result.count;
    }
    return { scheduled, orphanedScopesDetected: selection.orphanedScopesDetected };
  }

  async execute(job: Job, workerId: string): Promise<Job> {
    // Detach all execution identity before awaits. Persisted row is the authority.
    const input = { ...job };
    const inputLease = job.leaseExpiresAt?.getTime();
    const match = payloadPattern.exec(input.payloadReference);
    if (input.jobType !== IMPROVEMENT_FEEDBACK_RETENTION_JOB_TYPE || !match || !workerId)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid retention job');
    const serviceId = match[1]!;
    return this.client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM jobs WHERE id = ${input.id}::uuid FOR UPDATE`;
        const current = await tx.job.findUnique({ where: { id: input.id } });
        const started = new Date(this.now());
        if (
          !current ||
          current.workspaceId !== input.workspaceId ||
          current.environment !== input.environment ||
          current.jobType !== input.jobType ||
          current.payloadReference !== input.payloadReference ||
          current.bunshinId !== null ||
          current.capabilityType !== null ||
          current.status !== 'LEASED' ||
          current.leaseOwner !== workerId ||
          !current.leaseExpiresAt ||
          current.leaseExpiresAt.getTime() !== inputLease ||
          current.attemptCount !== input.attemptCount ||
          !Number.isFinite(started.getTime()) ||
          current.leaseExpiresAt <= started
        )
          throw new ApplicationError('CONFLICT', 'retention job lease is no longer valid');
        const result = await purgeExpiredImprovementFeedbackInTransaction(tx, {
          workspaceId: current.workspaceId,
          serviceId,
          now: started,
          limit: 100,
        });
        const finished = new Date(this.now());
        if (!Number.isFinite(finished.getTime()) || finished >= current.leaseExpiresAt)
          throw new ApplicationError('CONFLICT', 'retention job lease expired during purge');
        const updated = await tx.job.update({
          where: { id: current.id },
          data: {
            status: result.possiblyMore ? 'RETRY_SCHEDULED' : 'SUCCEEDED',
            nextRetryAt: result.possiblyMore ? new Date(finished.getTime() + 60_000) : null,
            completedAt: result.possiblyMore ? null : finished,
            // Successful bounded progress is not an infrastructure failure attempt.
            attemptCount: result.possiblyMore ? 0 : current.attemptCount,
            lastErrorCategory: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        const committedAt = new Date(this.now());
        if (!Number.isFinite(committedAt.getTime()) || committedAt >= current.leaseExpiresAt)
          throw new ApplicationError('CONFLICT', 'retention job lease expired before commit');
        return updated;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }
}
