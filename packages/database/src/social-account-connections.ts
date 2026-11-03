import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import { isMemberUsageScopePermitted } from './member-usage-authorization';
import { PrismaGroupFeatureEntitlementRepository } from './group-feature-entitlement';

export interface SocialAccountConnectionOwner {
  workspaceId: string;
  serviceId: string;
  groupMembershipId: string;
  userId: string;
  bunshinId: string;
}

export interface SocialAccountTokenCrypto {
  seal(token: string, context: readonly string[]): string;
  open(value: string, context: readonly string[]): string;
}

const REQUIRED_INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
] as const;

const ownerWhere = ({ serviceId, ...owner }: SocialAccountConnectionOwner) => ({
  ...owner,
  groupId: serviceId,
});

const credentialOwnerWhere = (owner: SocialAccountConnectionOwner) => ({
  workspaceId: owner.workspaceId,
  groupId: owner.serviceId,
  groupMembershipId: owner.groupMembershipId,
  userId: owner.userId,
});

const publicFields = {
  id: true,
  platform: true,
  externalAccountId: true,
  displayName: true,
  status: true,
  scopes: true,
  tokenExpiresAt: true,
  lastVerifiedAt: true,
  disconnectedAt: true,
} as const;

function tokenContext(
  owner: Omit<SocialAccountConnectionOwner, 'bunshinId'>,
  platform: string,
  externalAccountId: string,
) {
  return [
    owner.workspaceId,
    owner.serviceId,
    owner.groupMembershipId,
    owner.userId,
    platform,
    externalAccountId,
  ] as const;
}

/** Server-only SNS credential persistence. Public results never contain token material. */
export class PrismaSocialAccountConnections {
  constructor(
    private readonly client: PrismaClient,
    private readonly crypto: SocialAccountTokenCrypto,
  ) {}

  /** Lists only credentials explicitly granted to this Bunshin. Token material is never selected. */
  async list(actorUserId: string, owner: SocialAccountConnectionOwner) {
    this.requireOwner(actorUserId, owner);
    const now = new Date();
    return this.serializableTransaction(async (tx) => {
      await this.requireAuthorized(tx, actorUserId, owner, now);
      await tx.socialAccountConnection.updateMany({
        where: {
          ...credentialOwnerWhere(owner),
          status: 'CONNECTED',
          tokenExpiresAt: { lte: now },
          grants: { some: { ...ownerWhere(owner), bunshinId: owner.bunshinId } },
        },
        data: { status: 'RECONNECT_REQUIRED', encryptedToken: null, tokenExpiresAt: null },
      });
      return tx.socialAccountConnection.findMany({
        where: {
          ...credentialOwnerWhere(owner),
          grants: { some: { ...ownerWhere(owner), bunshinId: owner.bunshinId } },
        },
        select: publicFields,
        orderBy: [{ platform: 'asc' }, { displayName: 'asc' }, { id: 'asc' }],
      });
    });
  }

  async save(
    actorUserId: string,
    owner: SocialAccountConnectionOwner,
    account: {
      platform: 'INSTAGRAM';
      externalAccountId: string;
      displayName: string;
      scopes: string[];
      accessToken: string;
      tokenExpiresAt: Date;
    },
  ) {
    this.requireOwner(actorUserId, owner);
    const now = new Date();
    const normalized = this.validateAccount(account, now);
    return this.serializableTransaction(async (tx) => {
      await this.requireAuthorized(tx, actorUserId, owner, now);
      const credentialOwner = credentialOwnerWhere(owner);
      const connection = await tx.socialAccountConnection.upsert({
        where: {
          workspaceId_groupId_userId_platform_externalAccountId: {
            workspaceId: owner.workspaceId,
            groupId: owner.serviceId,
            userId: owner.userId,
            platform: account.platform,
            externalAccountId: normalized.externalAccountId,
          },
        },
        create: {
          ...credentialOwner,
          id: randomUUID(),
          platform: account.platform,
          externalAccountId: normalized.externalAccountId,
          displayName: normalized.displayName,
          scopes: normalized.scopes,
          encryptedToken: this.crypto.seal(
            normalized.accessToken,
            tokenContext(owner, account.platform, normalized.externalAccountId),
          ),
          tokenExpiresAt: account.tokenExpiresAt,
          status: 'CONNECTED',
          lastVerifiedAt: now,
          disconnectedAt: null,
        },
        update: {
          groupMembershipId: owner.groupMembershipId,
          displayName: normalized.displayName,
          scopes: normalized.scopes,
          encryptedToken: this.crypto.seal(
            normalized.accessToken,
            tokenContext(owner, account.platform, normalized.externalAccountId),
          ),
          tokenExpiresAt: account.tokenExpiresAt,
          status: 'CONNECTED',
          lastVerifiedAt: now,
          disconnectedAt: null,
        },
        select: publicFields,
      });
      await tx.socialAccountConnectionGrant.upsert({
        where: {
          connectionId_bunshinId: { connectionId: connection.id, bunshinId: owner.bunshinId },
        },
        create: {
          ...ownerWhere(owner),
          id: randomUUID(),
          connectionId: connection.id,
        },
        update: {
          workspaceId: owner.workspaceId,
          groupId: owner.serviceId,
          groupMembershipId: owner.groupMembershipId,
          userId: owner.userId,
        },
      });
      return connection;
    });
  }

  /** Removes this Bunshin's explicit grant; the last removal also destroys the stored token. */
  async disconnect(
    actorUserId: string,
    owner: SocialAccountConnectionOwner,
    id: string,
  ): Promise<void> {
    this.requireOwner(actorUserId, owner);
    const now = new Date();
    await this.serializableTransaction(async (tx) => {
      await this.requireAuthorized(tx, actorUserId, owner, now);
      const connection = await tx.socialAccountConnection.findFirst({
        where: {
          ...credentialOwnerWhere(owner),
          id,
          grants: { some: { ...ownerWhere(owner), bunshinId: owner.bunshinId } },
        },
        select: { id: true },
      });
      if (!connection) return;
      await tx.socialAccountConnectionGrant.deleteMany({
        where: { ...ownerWhere(owner), connectionId: id, bunshinId: owner.bunshinId },
      });
      const remaining = await tx.socialAccountConnectionGrant.count({
        where: { connectionId: id },
      });
      if (remaining === 0)
        await tx.socialAccountConnection.updateMany({
          where: { ...credentialOwnerWhere(owner), id },
          data: {
            status: 'DISCONNECTED',
            disconnectedAt: now,
            encryptedToken: null,
            tokenExpiresAt: null,
          },
        });
    });
  }

  /** Internal provider path. Scope is re-authorized before any token is decrypted. */
  async getUsableAccessToken(
    actorUserId: string,
    owner: SocialAccountConnectionOwner,
    id: string,
  ): Promise<string> {
    this.requireOwner(actorUserId, owner);
    const now = new Date();
    const result = await this.serializableTransaction(async (tx) => {
      await this.requireAuthorized(tx, actorUserId, owner, now);
      const connection = await tx.socialAccountConnection.findFirst({
        where: {
          ...credentialOwnerWhere(owner),
          id,
          grants: { some: { ...ownerWhere(owner), bunshinId: owner.bunshinId } },
        },
        select: {
          platform: true,
          externalAccountId: true,
          status: true,
          encryptedToken: true,
          tokenExpiresAt: true,
        },
      });
      if (!connection) throw new ApplicationError('NOT_FOUND', 'SNS connection unavailable');
      if (
        connection.status !== 'CONNECTED' ||
        !connection.encryptedToken ||
        !connection.tokenExpiresAt
      )
        throw new ApplicationError('FORBIDDEN', 'SNS connection unavailable');
      if (connection.tokenExpiresAt <= now) {
        await tx.socialAccountConnection.update({
          where: { id },
          data: {
            status: 'RECONNECT_REQUIRED',
            encryptedToken: null,
            tokenExpiresAt: null,
          },
        });
        return null;
      }
      return {
        encryptedToken: connection.encryptedToken,
        context: tokenContext(owner, connection.platform, connection.externalAccountId),
      };
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'SNS connection unavailable');
    return this.crypto.open(result.encryptedToken, result.context);
  }

  private requireOwner(actorUserId: string, owner: SocialAccountConnectionOwner) {
    if (actorUserId !== owner.userId)
      throw new ApplicationError('FORBIDDEN', 'SNS connection unavailable');
  }

  private async serializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || error.code === 'P2002');
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new ApplicationError('INTERNAL_ERROR', 'SNS connection transaction failed');
  }

  private async requireAuthorized(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    owner: SocialAccountConnectionOwner,
    now: Date,
  ) {
    const access = await new PrismaGroupFeatureEntitlementRepository(
      this.client,
    ).resolveAccessInTransaction(tx, {
      workspaceId: owner.workspaceId,
      groupId: owner.serviceId,
      actorUserId,
      featureKey: 'SOCIAL',
      now,
    });
    if (
      !access?.allowed ||
      !(await isMemberUsageScopePermitted(tx, owner, now)) ||
      !(await tx.bunshin.findFirst({
        where: {
          id: owner.bunshinId,
          workspaceId: owner.workspaceId,
          groupId: owner.serviceId,
          ownerUserId: actorUserId,
          status: 'ACTIVE',
          capabilityAssignments: {
            some: { capabilityType: 'SOCIAL', status: 'ACTIVE', activatedAt: { lte: now } },
          },
        },
        select: { id: true },
      }))
    )
      throw new ApplicationError('FORBIDDEN', 'SNS connection unavailable');
  }

  private validateAccount(
    account: {
      externalAccountId: string;
      displayName: string;
      scopes: string[];
      accessToken: string;
      tokenExpiresAt: Date;
    },
    now: Date,
  ) {
    const externalAccountId = account.externalAccountId.trim();
    const displayName = account.displayName.trim();
    const accessToken = account.accessToken.trim();
    const scopes = [...new Set(account.scopes)].sort();
    if (
      !externalAccountId ||
      externalAccountId.length > 255 ||
      !displayName ||
      displayName.length > 255 ||
      !accessToken ||
      !Number.isFinite(account.tokenExpiresAt.getTime()) ||
      account.tokenExpiresAt <= now ||
      scopes.some((scope) => !scope || scope.length > 100) ||
      REQUIRED_INSTAGRAM_SCOPES.some((scope) => !scopes.includes(scope))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'Invalid SNS credential');
    return { externalAccountId, displayName, accessToken, scopes };
  }
}
