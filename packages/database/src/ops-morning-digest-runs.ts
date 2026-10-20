import { ApplicationError } from '@bunshin/shared';
import { type PrismaClient, prisma } from './client';

export type OpsMorningDigestEnvironment = 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
export type OpsMorningDigestRunStatus = 'CLAIMED' | 'SENT' | 'FAILED';

export interface OpsMorningDigestClaim {
  id: string;
  attemptCount: number;
}

export interface OpsMorningDigestRunState {
  status: OpsMorningDigestRunStatus;
  leaseExpiresAt: Date | null;
  errorCategory: string | null;
}

const targetDateValue = (targetDate: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid digest date');
  return new Date(`${targetDate}T00:00:00.000Z`);
};

export class PrismaOpsMorningDigestRunRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async claim(input: {
    environment: OpsMorningDigestEnvironment;
    targetDate: string;
    now: Date;
    leaseMilliseconds?: number;
  }): Promise<OpsMorningDigestClaim | null> {
    const date = targetDateValue(input.targetDate);
    const leaseExpiresAt = new Date(input.now.getTime() + (input.leaseMilliseconds ?? 8 * 60_000));
    const rows = await this.client.$queryRaw<Array<{ id: string; attempt_count: number }>>`
      INSERT INTO "ops_morning_digest_runs" (
        "id", "environment", "target_date", "status", "lease_expires_at", "attempt_count", "created_at", "updated_at"
      ) VALUES (
        gen_random_uuid(), ${input.environment}, ${date}, 'CLAIMED', ${leaseExpiresAt}, 1, ${input.now}, ${input.now}
      )
      ON CONFLICT ("environment", "target_date") DO UPDATE SET
        "status" = 'CLAIMED',
        "lease_expires_at" = EXCLUDED."lease_expires_at",
        "attempt_count" = "ops_morning_digest_runs"."attempt_count" + 1,
        "error_category" = NULL,
        "sent_at" = NULL,
        "updated_at" = EXCLUDED."updated_at"
      WHERE "ops_morning_digest_runs"."status" = 'CLAIMED'
        AND "ops_morning_digest_runs"."lease_expires_at" <= ${input.now}
      RETURNING "id", "attempt_count"
    `;
    const row = rows[0];
    return row ? { id: row.id, attemptCount: row.attempt_count } : null;
  }

  async markSent(input: { claim: OpsMorningDigestClaim; sentAt: Date }): Promise<boolean> {
    const result = await this.client.opsMorningDigestRun.updateMany({
      where: {
        id: input.claim.id,
        status: 'CLAIMED',
        attemptCount: input.claim.attemptCount,
      },
      data: { status: 'SENT', leaseExpiresAt: null, errorCategory: null, sentAt: input.sentAt },
    });
    return result.count === 1;
  }

  async markFailed(input: {
    claim: OpsMorningDigestClaim;
    errorCategory:
      | 'COLLECTION_FAILED'
      | 'EMAIL_CONFIGURATION_MISSING'
      | 'EMAIL_PROVIDER_FAILED'
      | 'EMAIL_DELIVERY_UNCONFIRMED';
    failedAt: Date;
  }): Promise<boolean> {
    const result = await this.client.opsMorningDigestRun.updateMany({
      where: {
        id: input.claim.id,
        status: 'CLAIMED',
        attemptCount: input.claim.attemptCount,
      },
      data: {
        status: 'FAILED',
        leaseExpiresAt: null,
        sentAt: null,
        errorCategory: input.errorCategory,
        updatedAt: input.failedAt,
      },
    });
    return result.count === 1;
  }

  async deliveryStatus(input: {
    environment: OpsMorningDigestEnvironment;
    targetDate: string;
  }): Promise<'SENT' | 'NOT_SENT' | 'BEFORE_HISTORY'> {
    const targetDate = targetDateValue(input.targetDate);
    const run = await this.client.opsMorningDigestRun.findUnique({
      where: { environment_targetDate: { environment: input.environment, targetDate } },
      select: { status: true },
    });
    if (run?.status === 'SENT') return 'SENT';
    if (run) return 'NOT_SENT';

    const firstRun = await this.client.opsMorningDigestRun.findFirst({
      where: { environment: input.environment },
      orderBy: { targetDate: 'asc' },
      select: { targetDate: true },
    });
    if (!firstRun || firstRun.targetDate.getTime() > targetDate.getTime()) return 'BEFORE_HISTORY';
    return 'NOT_SENT';
  }

  async runState(input: {
    environment: OpsMorningDigestEnvironment;
    targetDate: string;
  }): Promise<OpsMorningDigestRunState | null> {
    const targetDate = targetDateValue(input.targetDate);
    return this.client.opsMorningDigestRun.findUnique({
      where: { environment_targetDate: { environment: input.environment, targetDate } },
      select: { status: true, leaseExpiresAt: true, errorCategory: true },
    }) as Promise<OpsMorningDigestRunState | null>;
  }
}
