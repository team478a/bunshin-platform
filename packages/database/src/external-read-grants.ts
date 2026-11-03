import { createHash } from 'node:crypto';
import {
  EXTERNAL_READ_FEATURE_KEY,
  EXTERNAL_READ_CONSENT_VERSION,
  normalizeExternalGrantOwner,
  normalizeExternalGrantIssue,
  normalizeExternalGrantRevoke,
  ExternalReadError,
  type ExternalGrantManagementRepository,
  type ExternalGrantOwner,
  type ExternalGrantIssue,
  type ExternalGrantRevoke,
  type ExternalReadGrant,
  type ExternalReadPrincipal,
  type ExternalReadEnvironment,
  type VerifiedExternalReadCredential,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma, PrismaClient, ExternalReadGrant as GrantRow } from '@prisma/client';
import { isMemberUsageScopePermitted } from './member-usage-authorization';
import {
  lockFeaturePolicyGroup,
  PrismaGroupFeatureEntitlementRepository,
} from './group-feature-entitlement';

export interface ExternalGrantServerPolicy {
  enabled: boolean;
  /** Server-defined clients. Empty by default; these IDs are not authentication credentials. */
  clients: readonly string[];
}
const txOptions = { maxWait: 1_000, timeout: 3_000 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function unavailable(): never {
  throw new ApplicationError('NOT_FOUND', 'external read grant unavailable');
}
function conflict(): never {
  throw new ApplicationError('CONFLICT', 'external read grant changed');
}
const ownerWhere = (o: ExternalGrantOwner) => ({
  workspaceId: o.scope.workspaceId,
  groupId: o.scope.serviceId,
  groupMembershipId: o.scope.groupMembershipId,
  userId: o.scope.userId,
  bunshinId: o.scope.bunshinId,
});
function projection(row: GrantRow): ExternalReadGrant {
  return {
    connectionId: row.id,
    clientId: row.clientId,
    environment: row.environment as ExternalReadEnvironment,
    revision: row.revision,
    scope: {
      workspaceId: row.workspaceId,
      serviceId: row.groupId,
      groupMembershipId: row.groupMembershipId,
      userId: row.userId,
      bunshinId: row.bunshinId,
    },
    operations: [...row.operations],
    grantedAt: row.grantedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}
function metadata(row: GrantRow) {
  return {
    connectionId: row.id,
    clientId: row.clientId,
    environment: row.environment,
    operation: 'member-usage:read',
    revision: row.revision,
    consentVersion: row.consentVersion,
    credentialBound: row.credentialBoundAt !== null,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
function running(signal: AbortSignal) {
  if (signal.aborted) throw new ExternalReadError('TIMEOUT');
}
/** Durable grants only. No bearer token/OAuth authentication or public HTTP endpoint. */
export class PrismaExternalReadGrantRepository implements ExternalGrantManagementRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly environment: ExternalReadEnvironment,
    private readonly serverPolicy: () => ExternalGrantServerPolicy = () => ({
      enabled: false,
      clients: [],
    }),
    private readonly now: () => Date = () => new Date(),
    private readonly credentialIssuer: string | null = null,
  ) {
    if (!['test', 'development', 'production'].includes(environment))
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid grant environment');
  }
  private at() {
    const at = new Date(this.now());
    if (!Number.isFinite(at.getTime()))
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid grant clock');
    return at;
  }
  private clientEnabled(clientId: string) {
    const policy = this.serverPolicy();
    return policy.enabled === true && policy.clients.includes(clientId);
  }
  private async owner(tx: Prisma.TransactionClient, o: ExternalGrantOwner) {
    const [member, bunshin] = await Promise.all([
      tx.groupMembership.findFirst({
        where: {
          id: o.scope.groupMembershipId,
          workspaceId: o.scope.workspaceId,
          groupId: o.scope.serviceId,
          userId: o.actorUserId,
        },
        select: { id: true },
      }),
      tx.bunshin.findFirst({
        where: {
          id: o.scope.bunshinId,
          workspaceId: o.scope.workspaceId,
          groupId: o.scope.serviceId,
          ownerUserId: o.actorUserId,
        },
        select: { id: true },
      }),
    ]);
    return Boolean(member && bunshin);
  }
  private async canRead(
    tx: Prisma.TransactionClient,
    row: Omit<GrantRow, 'id' | 'revision' | 'credentialBindingHash' | 'credentialBoundAt'>,
    at: Date,
  ) {
    if (
      !this.clientEnabled(row.clientId) ||
      row.environment !== this.environment ||
      row.revokedAt !== null ||
      row.grantedAt > at ||
      row.expiresAt <= at ||
      row.consentVersion !== EXTERNAL_READ_CONSENT_VERSION ||
      row.operations.length !== 1 ||
      row.operations[0] !== 'member-usage:read'
    )
      return false;
    const scope = {
      workspaceId: row.workspaceId,
      serviceId: row.groupId,
      groupMembershipId: row.groupMembershipId,
      userId: row.userId,
      bunshinId: row.bunshinId,
    };
    if (!(await isMemberUsageScopePermitted(tx, scope, at))) return false;
    if (
      !(await tx.bunshin.findFirst({
        where: {
          id: scope.bunshinId,
          workspaceId: scope.workspaceId,
          groupId: scope.serviceId,
          ownerUserId: scope.userId,
          status: 'ACTIVE',
          capabilityAssignments: {
            some: {
              workspaceId: scope.workspaceId,
              capabilityType: 'SOCIAL',
              status: 'ACTIVE',
              activatedAt: { lte: at },
            },
          },
        },
        select: { id: true },
      }))
    )
      return false;
    const resolver = new PrismaGroupFeatureEntitlementRepository(this.client);
    for (const featureKey of [EXTERNAL_READ_FEATURE_KEY, 'SOCIAL']) {
      const access = await resolver.resolveAccessInTransaction(tx, {
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        actorUserId: scope.userId,
        featureKey,
        now: at,
      });
      if (!access?.allowed || access.dailyLimit === 0 || access.monthlyLimit === 0) return false;
    }
    return true;
  }
  /** Same current checks as issue, without persisting a probe grant or audit. */
  async issuanceAllowed(inputOwner: ExternalGrantOwner, clientId: string): Promise<boolean> {
    const owner = normalizeExternalGrantOwner(inputOwner);
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const at = this.at();
      return this.canRead(
        tx,
        {
          ...ownerWhere(owner),
          clientId,
          environment: this.environment,
          operations: ['member-usage:read'],
          consentVersion: EXTERNAL_READ_CONSENT_VERSION,
          grantedAt: at,
          expiresAt: new Date(at.getTime() + 300_000),
          revokedAt: null,
        },
        at,
      );
    }, txOptions);
  }
  private credentialValid(credential: VerifiedExternalReadCredential, at: Date) {
    return (
      this.credentialIssuer !== null &&
      credential.issuer === this.credentialIssuer &&
      credential.environment === this.environment &&
      uuid.test(credential.subject) &&
      uuid.test(credential.sessionId) &&
      this.clientEnabled(credential.clientId) &&
      Number.isFinite(credential.expiresAt.getTime()) &&
      credential.expiresAt > at
    );
  }
  private bindingHash(id: string, credential: VerifiedExternalReadCredential) {
    return createHash('sha256')
      .update(
        JSON.stringify([
          'external-credential-v1',
          this.environment,
          id,
          credential.issuer,
          credential.subject,
          credential.clientId,
          credential.sessionId,
        ]),
      )
      .digest('hex');
  }
  private async credentialRow(
    tx: Prisma.TransactionClient,
    id: string,
    credential: VerifiedExternalReadCredential,
  ) {
    if (!this.credentialValid(credential, this.at()) || !uuid.test(id)) return null;
    const row = await tx.externalReadGrant.findFirst({
      where: { id, clientId: credential.clientId, environment: this.environment },
    });
    if (!row || !(await this.canRead(tx, row, this.at()))) return null;
    const identity = await tx.authIdentity.findFirst({
      where: {
        provider: 'EMAIL',
        providerUserId: credential.subject,
        userId: row.userId,
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    return identity && this.credentialValid(credential, this.at()) ? row : null;
  }
  async bind(
    connectionId: string,
    input: VerifiedExternalReadCredential,
    signal: AbortSignal,
  ): Promise<ExternalReadGrant> {
    running(signal);
    const credential = { ...input, expiresAt: new Date(input.expiresAt) };
    return this.client.$transaction(async (tx) => {
      const initial = await this.credentialRow(tx, connectionId, credential);
      if (!initial) unavailable();
      await lockFeaturePolicyGroup(tx, {
        workspaceId: initial.workspaceId,
        groupId: initial.groupId,
      });
      const row = await this.credentialRow(tx, connectionId, credential);
      if (!row) unavailable();
      const hash = this.bindingHash(row.id, credential);
      if (row.credentialBindingHash !== null) {
        if (row.credentialBindingHash !== hash) conflict();
        return projection(row);
      }
      running(signal);
      const at = this.at();
      const result = await tx.externalReadGrant.updateMany({
        where: { id: row.id, revision: row.revision, revokedAt: null, credentialBindingHash: null },
        data: { credentialBindingHash: hash, credentialBoundAt: at, revision: { increment: 1 } },
      });
      if (result.count !== 1) conflict();
      const after = await tx.externalReadGrant.findUniqueOrThrow({ where: { id: row.id } });
      await tx.groupFeatureAuditLog.create({
        data: {
          workspaceId: row.workspaceId,
          groupId: row.groupId,
          groupMembershipId: row.groupMembershipId,
          featureKey: EXTERNAL_READ_FEATURE_KEY,
          action: 'EXTERNAL_READ_BOUND',
          beforeData: metadata(row),
          afterData: metadata(after),
          reason: '署名検証済みの本人接続資格を許可へ結合',
          performedByUserId: row.userId,
          occurredAt: at,
        },
      });
      running(signal);
      if (
        !this.credentialValid(credential, this.at()) ||
        !(await this.canRead(tx, after, this.at()))
      )
        unavailable();
      running(signal);
      if (!this.credentialValid(credential, this.at()) || after.expiresAt <= this.at())
        unavailable();
      return projection(after);
    }, txOptions);
  }
  async resolve(
    connectionId: string,
    input: VerifiedExternalReadCredential,
    signal: AbortSignal,
  ): Promise<ExternalReadGrant | null> {
    running(signal);
    const credential = { ...input, expiresAt: new Date(input.expiresAt) };
    const result = await this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const row = await this.credentialRow(tx, connectionId, credential);
      return row &&
        row.credentialBindingHash === this.bindingHash(row.id, credential) &&
        this.credentialValid(credential, this.at())
        ? projection(row)
        : null;
    }, txOptions);
    running(signal);
    return this.credentialValid(credential, this.at()) ? result : null;
  }
  async issue(
    inputOwner: ExternalGrantOwner,
    input: ExternalGrantIssue,
  ): Promise<ExternalReadGrant> {
    const o = normalizeExternalGrantOwner(inputOwner),
      command = normalizeExternalGrantIssue(input);
    try {
      return await this.client.$transaction(async (tx) => {
        await lockFeaturePolicyGroup(tx, {
          workspaceId: o.scope.workspaceId,
          groupId: o.scope.serviceId,
        });
        const at = this.at();
        const data = {
          id: command.commandId,
          ...ownerWhere(o),
          clientId: command.clientId,
          environment: this.environment,
          operations: [command.operation],
          consentVersion: command.consentVersion,
          revision: 1,
          grantedAt: at,
          expiresAt: new Date(at.getTime() + command.expiresInMinutes * 60_000),
          revokedAt: null,
        };
        if (!(await this.owner(tx, o)) || !(await this.canRead(tx, data, at))) unavailable();
        const existing = await tx.externalReadGrant.findUnique({
          where: { id: command.commandId },
        });
        if (existing) {
          if (
            Object.entries(ownerWhere(o)).some(
              ([key, value]) => existing[key as keyof ReturnType<typeof ownerWhere>] !== value,
            ) ||
            existing.environment !== this.environment
          )
            unavailable();
          if (
            existing.clientId !== command.clientId ||
            existing.operations.length !== 1 ||
            existing.operations[0] !== command.operation ||
            existing.consentVersion !== command.consentVersion ||
            existing.expiresAt.getTime() - existing.grantedAt.getTime() !==
              command.expiresInMinutes * 60_000
          )
            conflict();
          return projection(existing); // Includes revoked/expired state; never renews or reactivates.
        }
        const active = await tx.externalReadGrant.count({
          where: {
            workspaceId: o.scope.workspaceId,
            groupId: o.scope.serviceId,
            groupMembershipId: o.scope.groupMembershipId,
            userId: o.scope.userId,
            environment: this.environment,
            revokedAt: null,
            expiresAt: { gt: at },
          },
        });
        if (active >= 5)
          throw new ApplicationError('CONFLICT', 'external read grant limit reached');
        const row = await tx.externalReadGrant.create({ data });
        await tx.groupFeatureAuditLog.create({
          data: {
            workspaceId: row.workspaceId,
            groupId: row.groupId,
            groupMembershipId: row.groupMembershipId,
            featureKey: EXTERNAL_READ_FEATURE_KEY,
            action: 'EXTERNAL_READ_GRANTED',
            afterData: metadata(row),
            reason: '本人が限定読取に明示同意',
            performedByUserId: o.actorUserId,
            occurredAt: at,
          },
        });
        if (!(await this.canRead(tx, row, this.at()))) unavailable();
        return projection(row);
      }, txOptions);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        conflict();
      throw error;
    }
  }
  async revoke(
    inputOwner: ExternalGrantOwner,
    input: ExternalGrantRevoke,
  ): Promise<ExternalReadGrant> {
    const o = normalizeExternalGrantOwner(inputOwner),
      command = normalizeExternalGrantRevoke(input);
    return this.client.$transaction(async (tx) => {
      await lockFeaturePolicyGroup(tx, {
        workspaceId: o.scope.workspaceId,
        groupId: o.scope.serviceId,
      });
      if (!(await this.owner(tx, o))) unavailable();
      const row = await tx.externalReadGrant.findFirst({
        where: { id: command.connectionId, ...ownerWhere(o), environment: this.environment },
      });
      if (!row) unavailable();
      if (row.revokedAt !== null) {
        if (
          command.expectedRevision !== row.revision &&
          command.expectedRevision !== row.revision - 1
        )
          conflict();
        return projection(row);
      }
      if (command.expectedRevision !== row.revision) conflict();
      const at = this.at();
      if (at < row.grantedAt)
        throw new ApplicationError('CONFIGURATION_ERROR', 'invalid grant clock');
      const changed = await tx.externalReadGrant.updateMany({
        where: {
          id: row.id,
          ...ownerWhere(o),
          environment: this.environment,
          revision: command.expectedRevision,
          revokedAt: null,
        },
        data: { revokedAt: at, revision: { increment: 1 } },
      });
      if (changed.count !== 1) conflict();
      const after = await tx.externalReadGrant.findUniqueOrThrow({ where: { id: row.id } });
      await tx.groupFeatureAuditLog.create({
        data: {
          workspaceId: row.workspaceId,
          groupId: row.groupId,
          groupMembershipId: row.groupMembershipId,
          featureKey: EXTERNAL_READ_FEATURE_KEY,
          action: 'EXTERNAL_READ_REVOKED',
          beforeData: metadata(row),
          afterData: metadata(after),
          reason: '本人が限定読取を解除',
          performedByUserId: o.actorUserId,
          occurredAt: at,
        },
      });
      return projection(after);
    }, txOptions);
  }
  async list(inputOwner: ExternalGrantOwner): Promise<ExternalReadGrant[]> {
    const o = normalizeExternalGrantOwner(inputOwner);
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      if (!(await this.owner(tx, o))) unavailable();
      return (
        await tx.externalReadGrant.findMany({
          where: { ...ownerWhere(o), environment: this.environment },
          orderBy: [{ grantedAt: 'desc' }, { id: 'asc' }],
          take: 50,
        })
      ).map(projection);
    }, txOptions);
  }
  async find(
    connectionId: string,
    principal: ExternalReadPrincipal,
    signal: AbortSignal,
  ): Promise<ExternalReadGrant | null> {
    running(signal);
    if (
      !uuid.test(connectionId) ||
      principal.environment !== this.environment ||
      !this.clientEnabled(principal.clientId)
    )
      return null;
    const result = await this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const row = await tx.externalReadGrant.findFirst({
        where: { id: connectionId, clientId: principal.clientId, environment: this.environment },
      });
      return row && (await this.canRead(tx, row, this.at())) ? projection(row) : null;
    }, txOptions);
    running(signal);
    return result;
  }
  async permitted(
    grant: ExternalReadGrant,
    operation: string,
    _at: Date,
    signal: AbortSignal,
  ): Promise<boolean> {
    running(signal);
    if (
      operation !== 'member-usage:read' ||
      grant.environment !== this.environment ||
      !uuid.test(grant.connectionId)
    )
      return false;
    const result = await this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const row = await tx.externalReadGrant.findFirst({
        where: {
          id: grant.connectionId,
          clientId: grant.clientId,
          environment: this.environment,
          workspaceId: grant.scope.workspaceId,
          groupId: grant.scope.serviceId,
          groupMembershipId: grant.scope.groupMembershipId,
          userId: grant.scope.userId,
          bunshinId: grant.scope.bunshinId,
          revision: grant.revision,
        },
      });
      return Boolean(
        row &&
        row.grantedAt.getTime() === grant.grantedAt.getTime() &&
        row.expiresAt.getTime() === grant.expiresAt.getTime() &&
        grant.revokedAt === null &&
        grant.operations.length === 1 &&
        grant.operations[0] === operation &&
        (await this.canRead(tx, row, this.at())),
      );
    }, txOptions);
    running(signal);
    return result;
  }
}
