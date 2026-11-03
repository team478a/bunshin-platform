import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PrismaSocialAccountConnections,
  type SocialAccountConnectionOwner,
  type SocialAccountTokenCrypto,
} from '../src/social-account-connections';

const scopes = ['instagram_business_basic', 'instagram_business_content_publish'];

/** Registered inside database.integration.test.ts, after its disposable DB preflight. */
export function registerSocialAccountConnectionIntegrationCases(client: PrismaClient) {
  describe('SNS account connection ownership and lifecycle', () => {
    const workspaceIds: string[] = [];
    const userIds: string[] = [];

    afterEach(async () => {
      await client.socialOAuthAttempt.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await client.socialAccountConnectionGrant.deleteMany({
        where: { workspaceId: { in: workspaceIds } },
      });
      await client.socialAccountConnection.deleteMany({
        where: { workspaceId: { in: workspaceIds } },
      });
      await client.bunshinCapabilityAssignment.deleteMany({
        where: { workspaceId: { in: workspaceIds } },
      });
      await client.bunshin.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await client.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await client.user.deleteMany({ where: { id: { in: userIds } } });
      workspaceIds.length = 0;
      userIds.length = 0;
    });

    async function fixture() {
      const user = await client.user.create({ data: { displayName: 'SNS credential owner' } });
      userIds.push(user.id);
      const workspace = await client.workspace.create({
        data: { name: 'SNS connection test', type: 'ORGANIZATION' },
      });
      workspaceIds.push(workspace.id);
      await client.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: user.id, role: 'MEMBER', status: 'ACTIVE' },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'SNS connection service' },
      });
      const configuration = await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: `sns-${randomUUID()}`,
          displayName: 'SNS connection service',
          description: 'Integration fixture',
          operatorName: 'Integration fixture',
          createdByUserId: user.id,
          updatedByUserId: user.id,
        },
      });
      const membership = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: user.id,
          status: 'ACTIVE',
          consentedAt: new Date(Date.now() - 60_000),
        },
      });
      await client.featureDefinition.upsert({
        where: { key: 'SOCIAL' },
        create: { key: 'SOCIAL', name: 'SOCIAL', description: 'SOCIAL' },
        update: { status: 'ACTIVE' },
      });
      await client.groupFeaturePolicy.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          featureKey: 'SOCIAL',
          status: 'ENABLED',
          setByUserId: user.id,
        },
      });
      await client.groupMemberFeatureAssignment.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          groupMembershipId: membership.id,
          featureKey: 'SOCIAL',
          status: 'ENABLED',
          assignedByUserId: user.id,
        },
      });
      const makeBunshin = async () => {
        const bunshin = await client.bunshin.create({
          data: {
            workspaceId: workspace.id,
            groupId: group.id,
            ownerUserId: user.id,
            name: 'SNS Bunshin',
            slug: `sns-${randomUUID()}`,
            type: 'COPY',
            status: 'ACTIVE',
            objectiveSummary: 'SNS',
            audienceSummary: 'SNS',
            personalitySummary: 'SNS',
          },
        });
        await client.bunshinCapabilityAssignment.create({
          data: {
            workspaceId: workspace.id,
            bunshinId: bunshin.id,
            capabilityType: 'SOCIAL',
            status: 'ACTIVE',
            assignedByUserId: user.id,
          },
        });
        return bunshin;
      };
      const bunshin = await makeBunshin();
      const owner: SocialAccountConnectionOwner = {
        workspaceId: workspace.id,
        serviceId: group.id,
        groupMembershipId: membership.id,
        userId: user.id,
        bunshinId: bunshin.id,
      };
      const values = new Map<string, string>();
      const crypto: SocialAccountTokenCrypto = {
        seal(token) {
          const sealed = `test.${randomUUID()}`;
          values.set(sealed, token);
          return sealed;
        },
        open(value) {
          const token = values.get(value);
          if (!token) throw new Error('unknown test credential');
          return token;
        },
      };
      return {
        user,
        workspace,
        group,
        configuration,
        membership,
        bunshin,
        makeBunshin,
        owner,
        repository: new PrismaSocialAccountConnections(client, crypto),
      };
    }

    const account = (accessToken: string) => ({
      platform: 'INSTAGRAM' as const,
      externalAccountId: '17841400000000000',
      displayName: 'official.account',
      scopes,
      accessToken,
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1_000),
    });

    it('stores one credential with explicit grants for multiple Bunshins', async () => {
      const f = await fixture();
      const second = await f.makeBunshin();
      const first = await f.repository.save(f.user.id, f.owner, account('TOKEN_FIRST'));
      const secondOwner = { ...f.owner, bunshinId: second.id };
      const reused = await f.repository.save(f.user.id, secondOwner, account('TOKEN_LATEST'));

      expect(reused.id).toBe(first.id);
      expect(await client.socialAccountConnection.count({ where: { id: first.id } })).toBe(1);
      expect(
        await client.socialAccountConnectionGrant.count({ where: { connectionId: first.id } }),
      ).toBe(2);
      const stored = await client.socialAccountConnection.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(stored.encryptedToken).not.toContain('TOKEN');
      expect(JSON.stringify(first)).not.toContain('TOKEN');
      expect(await f.repository.getUsableAccessToken(f.user.id, f.owner, first.id)).toBe(
        'TOKEN_LATEST',
      );
      expect(await f.repository.getUsableAccessToken(f.user.id, secondOwner, first.id)).toBe(
        'TOKEN_LATEST',
      );

      await f.repository.disconnect(f.user.id, f.owner, first.id);
      await expect(
        f.repository.getUsableAccessToken(f.user.id, f.owner, first.id),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await f.repository.getUsableAccessToken(f.user.id, secondOwner, first.id)).toBe(
        'TOKEN_LATEST',
      );
      await f.repository.disconnect(f.user.id, secondOwner, first.id);
      await f.repository.disconnect(f.user.id, secondOwner, first.id);
      expect(
        await client.socialAccountConnection.findUniqueOrThrow({ where: { id: first.id } }),
      ).toMatchObject({ status: 'DISCONNECTED', encryptedToken: null, tokenExpiresAt: null });
    });

    it('reconnects idempotently and requires the official initial scopes', async () => {
      const f = await fixture();
      const first = await f.repository.save(f.user.id, f.owner, account('TOKEN_1'));
      const second = await f.repository.save(f.user.id, f.owner, account('TOKEN_2'));
      await Promise.all([
        f.repository.save(f.user.id, f.owner, account('TOKEN_3')),
        f.repository.save(f.user.id, f.owner, account('TOKEN_3')),
      ]);
      expect(second.id).toBe(first.id);
      expect(
        await client.socialAccountConnectionGrant.count({ where: { connectionId: first.id } }),
      ).toBe(1);
      expect(await f.repository.getUsableAccessToken(f.user.id, f.owner, first.id)).toBe('TOKEN_3');
      await expect(
        f.repository.save(f.user.id, f.owner, {
          ...account('TOKEN_4'),
          scopes: ['instagram_business_basic'],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects cross-scope use and rechecks membership, entitlement and capability', async () => {
      const f = await fixture();
      const connection = await f.repository.save(f.user.id, f.owner, account('PRIVATE_TOKEN'));
      const other = await client.user.create({ data: { displayName: 'Other SNS user' } });
      userIds.push(other.id);
      await expect(
        f.repository.getUsableAccessToken(other.id, f.owner, connection.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        f.repository.getUsableAccessToken(
          f.user.id,
          { ...f.owner, workspaceId: randomUUID() },
          connection.id,
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        f.repository.getUsableAccessToken(
          f.user.id,
          { ...f.owner, serviceId: randomUUID() },
          connection.id,
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const ungranted = await f.makeBunshin();
      await expect(
        f.repository.getUsableAccessToken(
          f.user.id,
          { ...f.owner, bunshinId: ungranted.id },
          connection.id,
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await client.bunshinCapabilityAssignment.updateMany({
        where: { bunshinId: f.bunshin.id, capabilityType: 'SOCIAL' },
        data: { status: 'SUSPENDED' },
      });
      await expect(
        f.repository.getUsableAccessToken(f.user.id, f.owner, connection.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await client.bunshinCapabilityAssignment.updateMany({
        where: { bunshinId: f.bunshin.id, capabilityType: 'SOCIAL' },
        data: { status: 'ACTIVE' },
      });
      await client.groupMemberFeatureAssignment.updateMany({
        where: { groupMembershipId: f.membership.id, featureKey: 'SOCIAL' },
        data: { status: 'DISABLED' },
      });
      await expect(
        f.repository.getUsableAccessToken(f.user.id, f.owner, connection.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await client.groupMemberFeatureAssignment.updateMany({
        where: { groupMembershipId: f.membership.id, featureKey: 'SOCIAL' },
        data: { status: 'ENABLED' },
      });
      await client.groupMembership.update({
        where: { id: f.membership.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await expect(
        f.repository.getUsableAccessToken(f.user.id, f.owner, connection.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await client.groupMembership.update({
        where: { id: f.membership.id },
        data: { status: 'ACTIVE', revokedAt: null },
      });
      await client.user.update({ where: { id: f.user.id }, data: { status: 'SUSPENDED' } });
      await expect(
        f.repository.getUsableAccessToken(f.user.id, f.owner, connection.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('destroys expired token material and leaves a reconnect-required state', async () => {
      const f = await fixture();
      const connection = await f.repository.save(f.user.id, f.owner, account('EXPIRING_TOKEN'));
      await client.socialAccountConnection.update({
        where: { id: connection.id },
        data: { tokenExpiresAt: new Date(Date.now() - 1_000) },
      });
      expect(await f.repository.list(f.user.id, f.owner)).toEqual([
        expect.objectContaining({ id: connection.id, status: 'RECONNECT_REQUIRED' }),
      ]);
      expect(
        await client.socialAccountConnection.findUniqueOrThrow({ where: { id: connection.id } }),
      ).toMatchObject({ status: 'RECONNECT_REQUIRED', encryptedToken: null, tokenExpiresAt: null });
    });

    it('enables RLS without adding broad database policies', async () => {
      const tables = await client.$queryRaw<
        Array<{ relname: string; relrowsecurity: boolean }>
      >`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('social_account_connections', 'social_account_connection_grants', 'social_oauth_attempts') ORDER BY relname`;
      expect(tables).toEqual([
        { relname: 'social_account_connection_grants', relrowsecurity: true },
        { relname: 'social_account_connections', relrowsecurity: true },
        { relname: 'social_oauth_attempts', relrowsecurity: true },
      ]);
      const policies = await client.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_policies
        WHERE tablename IN ('social_account_connections', 'social_account_connection_grants', 'social_oauth_attempts')`;
      expect(policies).toHaveLength(0);
    });

    it('binds OAuth attempts to the owner scope and allows only one atomic claim', async () => {
      const f = await fixture();
      const stateHash = 'a'.repeat(64);
      await client.socialOAuthAttempt.create({
        data: {
          stateHash,
          workspaceId: f.owner.workspaceId,
          groupId: f.owner.serviceId,
          groupMembershipId: f.owner.groupMembershipId,
          userId: f.owner.userId,
          bunshinId: f.owner.bunshinId,
          platform: 'INSTAGRAM',
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const now = new Date();
      const claims = await Promise.all([
        client.socialOAuthAttempt.updateMany({
          where: { stateHash, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        }),
        client.socialOAuthAttempt.updateMany({
          where: { stateHash, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        }),
      ]);
      expect(claims.map((claim) => claim.count).sort()).toEqual([0, 1]);
      await expect(
        client.socialOAuthAttempt.create({
          data: {
            stateHash: 'b'.repeat(64),
            workspaceId: f.owner.workspaceId,
            groupId: f.owner.serviceId,
            groupMembershipId: f.owner.groupMembershipId,
            userId: f.owner.userId,
            bunshinId: randomUUID(),
            platform: 'INSTAGRAM',
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });
  });
}
