import type {
  EnqueueJobInput,
  Job,
  JobRepository,
  LineNotificationPreference,
  MissionAutomationCandidateRepository,
  MissionAutomationScopeRepository,
  TrendResearchAutomationCandidateRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { type Prisma, type PrismaClient, prisma } from './client';

function lineNotificationPreference(
  row: Prisma.LineNotificationPreferenceGetPayload<object>,
): LineNotificationPreference {
  return row;
}
function platformJob(row: Prisma.JobGetPayload<object>): Job {
  return {
    ...row,
    capabilityType: row.capabilityType,
    environment: row.environment,
    status: row.status,
  };
}

export class PrismaJobRepository implements JobRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async enqueue(input: EnqueueJobInput): Promise<Job> {
    const scope = await this.client.workspace.findFirst({
      where: {
        id: input.workspaceId,
        status: 'ACTIVE',
        memberships: { some: { userId: input.requestedBy, status: 'ACTIVE' } },
        ...(input.bunshinId
          ? { bunshins: { some: { id: input.bunshinId, status: { not: 'ARCHIVED' } } } }
          : {}),
      },
      select: { id: true },
    });
    if (!scope) throw new ApplicationError('NOT_FOUND', 'job scope not found');
    const row = await this.client.job.upsert({
      where: {
        environment_idempotencyKey: {
          environment: input.environment,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        environment: input.environment,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId ?? null,
        capabilityType: input.capabilityType ?? null,
        jobType: input.jobType,
        payloadReference: input.payloadReference,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        requestedBy: input.requestedBy,
        priority: input.priority ?? 100,
        maxAttempts: input.maxAttempts ?? 5,
        scheduledAt: input.scheduledAt ?? new Date(),
      },
      update: {},
    });
    if (
      row.workspaceId !== input.workspaceId ||
      row.bunshinId !== (input.bunshinId ?? null) ||
      row.jobType !== input.jobType ||
      row.payloadReference !== input.payloadReference
    )
      throw new ApplicationError('CONFLICT', 'idempotency key belongs to another job');
    return platformJob(row);
  }

  async claim(input: Parameters<JobRepository['claim']>[0]): Promise<Job | null> {
    const rows = await this.client.$queryRaw<Array<{ id: string }>>`
      WITH candidate AS (
        SELECT "id"
        FROM "jobs"
        WHERE "environment" = ${input.environment}::"LineConfigurationEnvironment"
          AND (
            ("status" = 'PENDING' AND "scheduled_at" <= ${input.now})
            OR ("status" = 'RETRY_SCHEDULED' AND "next_retry_at" <= ${input.now})
            OR ("status" = 'LEASED' AND "lease_expires_at" <= ${input.now})
          )
        ORDER BY "priority" ASC, COALESCE("next_retry_at", "scheduled_at") ASC, "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "jobs" AS job
      SET "status" = 'LEASED',
          "lease_owner" = ${input.workerId},
          "lease_expires_at" = ${input.leaseExpiresAt},
          "attempt_count" = "attempt_count" + 1,
          "next_retry_at" = NULL,
          "updated_at" = ${input.now}
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job."id"
    `;
    const claimed = rows[0];
    if (!claimed) return null;
    return platformJob(await this.client.job.findUniqueOrThrow({ where: { id: claimed.id } }));
  }

  async complete(input: Parameters<JobRepository['complete']>[0]): Promise<Job | null> {
    const result = await this.client.job.updateMany({
      where: {
        id: input.jobId,
        status: 'LEASED',
        leaseOwner: input.workerId,
        leaseExpiresAt: { gt: input.now },
      },
      data: {
        status: 'SUCCEEDED',
        completedAt: input.now,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (result.count === 0) return null;
    return platformJob(await this.client.job.findUniqueOrThrow({ where: { id: input.jobId } }));
  }

  async fail(input: Parameters<JobRepository['fail']>[0]): Promise<Job | null> {
    const result = await this.client.job.updateMany({
      where: {
        id: input.jobId,
        status: 'LEASED',
        leaseOwner: input.workerId,
        leaseExpiresAt: { gt: input.now },
      },
      data: {
        status: input.nextRetryAt ? 'RETRY_SCHEDULED' : 'DEAD',
        nextRetryAt: input.nextRetryAt,
        lastErrorCategory: input.failure.errorCategory,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (result.count === 0) return null;
    return platformJob(await this.client.job.findUniqueOrThrow({ where: { id: input.jobId } }));
  }

  async cancel(input: Parameters<JobRepository['cancel']>[0]): Promise<Job | null> {
    const result = await this.client.job.updateMany({
      where: {
        id: input.jobId,
        environment: input.environment,
        status: { in: ['PENDING', 'RETRY_SCHEDULED'] },
      },
      data: { status: 'CANCELLED', cancelledAt: input.now },
    });
    if (result.count === 0) return null;
    return platformJob(await this.client.job.findUniqueOrThrow({ where: { id: input.jobId } }));
  }
}

export class PrismaMissionAutomationScopeRepository implements MissionAutomationScopeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async base(input: { workspaceId: string; bunshinId: string; actorUserId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        OR: [
          { ownerUserId: input.actorUserId },
          {
            workspace: {
              memberships: {
                some: {
                  userId: input.actorUserId,
                  status: 'ACTIVE',
                  role: { in: ['OWNER', 'ADMIN'] },
                },
              },
            },
          },
        ],
        capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
        socialAccountStrategies: { some: { status: 'APPROVED' } },
        socialProfiles: { some: { status: 'ACTIVE' } },
        AND: [
          {
            OR: [
              { groupId: null },
              {
                ownerUserId: input.actorUserId,
                group: {
                  status: 'ACTIVE',
                  memberships: {
                    some: {
                      userId: input.actorUserId,
                      status: 'ACTIVE',
                      consentedAt: { not: null },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      select: { id: true, groupId: true },
    });
  }

  async resolveScope(input: { workspaceId: string; bunshinId: string; actorUserId: string }) {
    const row = await this.base(input);
    if (!row) throw new ApplicationError('FORBIDDEN', 'automation scope is unavailable');
    if (row.groupId) {
      const preference = await this.client.lineNotificationPreference.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          userId: input.actorUserId,
          enabled: true,
          notificationConsentAt: { not: null },
          OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }],
        },
        select: { id: true },
      });
      if (!preference) throw new ApplicationError('FORBIDDEN', 'automatic delivery is disabled');
    }
    return { ...input, groupId: row.groupId };
  }

  async validateWeekly(input: Parameters<MissionAutomationScopeRepository['validateWeekly']>[0]) {
    if (!(await this.base(input))) return false;
    return (
      (await this.client.contentPillar.count({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          active: true,
          deletedAt: null,
        },
      })) > 0
    );
  }

  async validateDaily(input: Parameters<MissionAutomationScopeRepository['validateDaily']>[0]) {
    const scope = await this.base(input);
    if (!scope) return false;
    // Service jobs prepare and confirm their own week before checking today's items.
    if (scope.groupId) {
      const monday = new Date(`${input.missionDate}T00:00:00.000Z`);
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      return this.validateWeekly({ ...input, weekStartDate: monday.toISOString().slice(0, 10) });
    }
    const missionDate = new Date(`${input.missionDate}T00:00:00.000Z`);
    return (
      (await this.client.weeklyPlan.count({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'CONFIRMED',
          weekStartDate: {
            lte: missionDate,
            gte: new Date(missionDate.getTime() - 6 * 86_400_000),
          },
          items: { some: { scheduledDate: missionDate } },
        },
      })) > 0
    );
  }

  async validateTrend(input: Parameters<MissionAutomationScopeRepository['validateTrend']>[0]) {
    if (!(await this.base(input))) return false;
    return (
      (await this.client.socialProfile.count({
        where: {
          id: input.socialProfileId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'ACTIVE',
          accountStrategies: { some: { status: 'APPROVED' } },
          bunshin: {
            OR: [
              { groupId: null },
              { group: { serviceConfiguration: { trendResearchEnabled: true } } },
            ],
          },
        },
      })) > 0
    );
  }
}

export class PrismaMissionAutomationCandidateRepository implements MissionAutomationCandidateRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listEnabled(limit: number, cursor?: string) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid scheduler candidate limit');
    const rows = await this.client.lineNotificationPreference.findMany({
      where: {
        ...(cursor ? { id: { gt: cursor } } : {}),
        enabled: true,
        notificationConsentAt: { not: null },
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE', memberships: { some: { status: 'ACTIVE' } } },
        bunshin: { status: { not: 'ARCHIVED' } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const candidates = rows.slice(0, limit).map(lineNotificationPreference);
    const truncated = rows.length > limit;
    return {
      candidates,
      truncated,
      ...(truncated && candidates.length > 0
        ? { nextCursor: candidates[candidates.length - 1]!.id }
        : {}),
    };
  }
}

export class PrismaTrendResearchAutomationCandidateRepository implements TrendResearchAutomationCandidateRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listEligible(limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid trend scheduler candidate limit');
    const rows = await this.client.socialProfile.findMany({
      where: {
        status: 'ACTIVE',
        accountStrategies: { some: { status: 'APPROVED' } },
        bunshin: {
          status: { not: 'ARCHIVED' },
          ownerUser: { status: 'ACTIVE' },
          workspace: { status: 'ACTIVE', memberships: { some: { status: 'ACTIVE' } } },
          capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
          OR: [
            { groupId: null },
            { group: { serviceConfiguration: { trendResearchEnabled: true } } },
          ],
        },
      },
      select: {
        id: true,
        workspaceId: true,
        bunshinId: true,
        bunshin: { select: { ownerUserId: true } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return {
      candidates: rows.slice(0, limit).map((row) => ({
        workspaceId: row.workspaceId,
        bunshinId: row.bunshinId,
        actorUserId: row.bunshin.ownerUserId,
        socialProfileId: row.id,
      })),
      truncated: rows.length > limit,
    };
  }
}
