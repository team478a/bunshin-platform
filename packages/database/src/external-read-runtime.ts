import { randomUUID } from 'node:crypto';
import {
  EXTERNAL_READ_VERSION,
  ExternalReadError,
  type ExternalReadEnvironment,
  type ExternalReadGrant,
  type ExternalReadPorts,
} from '@bunshin/application';
import type { Prisma, PrismaClient } from '@prisma/client';

export interface ExternalReadAdmissionPolicy {
  enabled: boolean;
  windowMs: number;
  leaseMs: number;
  client: { requests: number; concurrent: number };
  connection: { requests: number; concurrent: number };
  user: { requests: number; concurrent: number };
}
type AuditEvent = Parameters<ExternalReadPorts['audit']['record']>[0];
type AdmissionPort = ExternalReadPorts['admission'];
type AuditPort = ExternalReadPorts['audit'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = /^[a-zA-Z0-9_-]{1,128}$/;
const scopes = ['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const;
const outcomes = ['READ_COMPLETED', 'DENIED', 'LIMITED', 'TIMEOUT', 'UNAVAILABLE', 'INVALID'];
function running(signal: AbortSignal) {
  if (signal.aborted) throw new ExternalReadError('TIMEOUT');
}
function unavailable(): never {
  throw new ExternalReadError('UNAVAILABLE');
}
function validPolicy(policy: ExternalReadAdmissionPolicy) {
  return (
    policy !== undefined &&
    policy !== null &&
    typeof policy.enabled === 'boolean' &&
    Number.isSafeInteger(policy.windowMs) &&
    policy.windowMs >= 1_000 &&
    policy.windowMs <= 86_400_000 &&
    Number.isSafeInteger(policy.leaseMs) &&
    policy.leaseMs >= 10_000 &&
    policy.leaseMs <= 30_000 &&
    [policy.client, policy.connection, policy.user].every(
      (axis) =>
        axis &&
        Number.isSafeInteger(axis.requests) &&
        axis.requests >= 1 &&
        axis.requests <= 1_000 &&
        Number.isSafeInteger(axis.concurrent) &&
        axis.concurrent >= 1 &&
        axis.concurrent <= 20,
    )
  );
}

/** Internal DB adapter only. Call after credential/grant authorization; never wire directly to HTTP. */
export class PrismaExternalReadRuntime implements AdmissionPort, AuditPort {
  constructor(
    private readonly client: PrismaClient,
    private readonly environment: ExternalReadEnvironment,
    private readonly policy: () => ExternalReadAdmissionPolicy | null,
  ) {
    if (!['test', 'development', 'production'].includes(environment)) unavailable();
  }

  private async transaction<T>(
    signal: AbortSignal,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    reservation = false,
  ): Promise<T> {
    running(signal);
    try {
      const result = await this.client.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL statement_timeout = '200ms'`;
          await tx.$executeRaw`SET LOCAL lock_timeout = '100ms'`;
          running(signal);
          const value = await work(tx);
          running(signal);
          return value;
        },
        reservation
          ? { maxWait: 200, timeout: 1_000, isolationLevel: 'ReadCommitted' }
          : { maxWait: 100, timeout: 300, isolationLevel: 'ReadCommitted' },
      );
      running(signal);
      return result;
    } catch (error) {
      if (error instanceof ExternalReadError) throw error;
      unavailable();
    }
  }

  async reserve(grant: ExternalReadGrant, signal: AbortSignal) {
    running(signal);
    let policy: ExternalReadAdmissionPolicy | null;
    try {
      const configured = this.policy();
      policy = configured === null ? null : structuredClone(configured);
    } catch {
      unavailable();
    }
    if (policy === null) return null;
    if (!validPolicy(policy)) unavailable();
    if (!policy.enabled) return null;
    if (
      grant.environment !== this.environment ||
      !uuid.test(grant.connectionId) ||
      !identifier.test(grant.clientId) ||
      !scopes.every((key) => uuid.test(grant.scope[key]))
    )
      throw new ExternalReadError('DENIED');
    const environment = this.environment;
    const connectionId = grant.connectionId.toLowerCase();
    const clientId = grant.clientId;
    const userId = grant.scope.userId.toLowerCase();
    const scope = { ...grant.scope };
    const revision = grant.revision;
    const activePolicy = policy;
    const permit = await this.transaction(
      signal,
      async (tx) => {
        // Fixed ordering across workers. No provider or source read inside the transaction.
        for (const key of [
          `external-read:${environment}:client:${clientId}`,
          `external-read:${environment}:connection:${connectionId}`,
          `external-read:${environment}:user:${userId}`,
        ]) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
          running(signal);
        }
        const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
        if (!clock) unavailable();
        const row = await tx.externalReadGrant.findFirst({
          where: {
            id: connectionId,
            environment,
            clientId,
            userId,
            workspaceId: scope.workspaceId,
            groupId: scope.serviceId,
            groupMembershipId: scope.groupMembershipId,
            bunshinId: scope.bunshinId,
            revision,
            grantedAt: { lte: clock.now },
            expiresAt: { gt: clock.now },
            revokedAt: null,
          },
        });
        if (!row) throw new ExternalReadError('DENIED');
        const from = new Date(clock.now.getTime() - activePolicy.windowMs);
        const [counts] = await tx.$queryRaw<
          {
            clientRequests: bigint;
            clientConcurrent: bigint;
            connectionRequests: bigint;
            connectionConcurrent: bigint;
            userRequests: bigint;
            userConcurrent: bigint;
          }[]
        >`
          SELECT
            COUNT(*) FILTER (WHERE client_id=${clientId} AND admitted_at > ${from}) AS "clientRequests",
            COUNT(*) FILTER (WHERE client_id=${clientId} AND released_at IS NULL AND expires_at > ${clock.now}) AS "clientConcurrent",
            COUNT(*) FILTER (WHERE connection_id=${connectionId}::uuid AND admitted_at > ${from}) AS "connectionRequests",
            COUNT(*) FILTER (WHERE connection_id=${connectionId}::uuid AND released_at IS NULL AND expires_at > ${clock.now}) AS "connectionConcurrent",
            COUNT(*) FILTER (WHERE user_id=${userId}::uuid AND admitted_at > ${from}) AS "userRequests",
            COUNT(*) FILTER (WHERE user_id=${userId}::uuid AND released_at IS NULL AND expires_at > ${clock.now}) AS "userConcurrent"
          FROM external_read_admissions WHERE environment=${environment}
            AND (client_id=${clientId} OR connection_id=${connectionId}::uuid OR user_id=${userId}::uuid)
            AND (admitted_at > ${from} OR (released_at IS NULL AND expires_at > ${clock.now}))`;
        if (!counts) unavailable();
        for (const [requests, concurrent, limit] of [
          [counts.clientRequests, counts.clientConcurrent, activePolicy.client],
          [counts.connectionRequests, counts.connectionConcurrent, activePolicy.connection],
          [counts.userRequests, counts.userConcurrent, activePolicy.user],
        ] as const) {
          if (requests >= BigInt(limit.requests) || concurrent >= BigInt(limit.concurrent))
            return null;
        }
        const expiresAt = new Date(clock.now.getTime() + activePolicy.leaseMs);
        return tx.externalReadAdmission.create({
          data: {
            id: randomUUID(),
            environment,
            connectionId,
            clientId,
            userId,
            admittedAt: clock.now,
            expiresAt,
          },
          select: { id: true },
        });
      },
      true,
    );
    if (permit === null) return null;
    return {
      release: async (releaseSignal: AbortSignal) => {
        await this.transaction(releaseSignal, async (tx) => {
          await tx.$executeRaw`
            UPDATE external_read_admissions SET released_at=clock_timestamp()
            WHERE id=${permit.id}::uuid AND environment=${environment}
              AND connection_id=${connectionId}::uuid AND client_id=${clientId}
              AND user_id=${userId}::uuid AND released_at IS NULL`;
        });
      },
    };
  }

  async record(event: AuditEvent, signal: AbortSignal) {
    if (
      event.version !== EXTERNAL_READ_VERSION ||
      !uuid.test(event.attemptId) ||
      !identifier.test(event.requestId) ||
      !identifier.test(event.connectionId) ||
      !identifier.test(event.clientId) ||
      event.environment !== this.environment ||
      event.operation !== 'member-usage:read' ||
      !outcomes.includes(event.outcome) ||
      !Number.isSafeInteger(event.count) ||
      event.count < 0 ||
      event.count > 10 ||
      (event.outcome !== 'READ_COMPLETED' && event.count !== 0)
    )
      unavailable();
    // Explicit projection: runtime extra fields must never become persisted metadata.
    const data = {
      attemptId: event.attemptId.toLowerCase(),
      version: event.version,
      requestId: event.requestId,
      connectionId: event.connectionId,
      clientId: event.clientId,
      environment: this.environment,
      operation: event.operation,
      outcome: event.outcome,
      count: event.count,
    };
    await this.transaction(signal, async (tx) => {
      await tx.externalReadAudit.createMany({ data: [data], skipDuplicates: true });
      const row = await tx.externalReadAudit.findUnique({
        where: { attemptId_outcome: { attemptId: data.attemptId, outcome: data.outcome } },
      });
      if (
        !row ||
        Object.entries(data).some(([key, value]) => row[key as keyof typeof data] !== value)
      )
        unavailable();
    });
  }

  /** Internal maintenance only. No scheduling, HTTP access or automatic production execution. */
  async prune(signal: AbortSignal, batchSize = 100) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) unavailable();
    return this.transaction(signal, async (tx) => {
      const admissions = await tx.$executeRaw`
        WITH expired AS MATERIALIZED (
          SELECT id FROM external_read_admissions WHERE environment=${this.environment}
            AND admitted_at < clock_timestamp() - INTERVAL '2 days'
            AND expires_at < clock_timestamp()
          ORDER BY admitted_at, id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
        ) DELETE FROM external_read_admissions AS target USING expired
          WHERE target.id=expired.id`;
      const audits = await tx.$executeRaw`
        WITH expired AS MATERIALIZED (
          SELECT id FROM external_read_audits WHERE environment=${this.environment}
            AND occurred_at < clock_timestamp() - INTERVAL '30 days'
          ORDER BY occurred_at, id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
        ) DELETE FROM external_read_audits AS target USING expired
          WHERE target.id=expired.id`;
      return { admissions, audits };
    });
  }
}
