import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_READ_CONSENT_VERSION,
  EXTERNAL_READ_FEATURE_KEY,
  ManageExternalReadGrants,
  ReadExternalMemberUsage,
  type ExternalGrantOwner,
  type ExternalGrantIssue,
  type ExternalReadPorts,
} from '@bunshin/application';
import {
  PrismaExternalReadGrantRepository,
  type ExternalGrantServerPolicy,
} from '../src/external-read-grants';
import { PrismaMemberUsageRepository } from '../src/member-usage-repository';
const epoch = new Date('2026-11-03T00:00:00Z');
const principal = { clientId: 'synthetic-client', environment: 'test' as const };
const signal = () => new AbortController().signal;
export function registerExternalReadGrantIntegrationCases(client: PrismaClient) {
  describe('external read grant PostgreSQL lifecycle', () => {
    const workspaces: string[] = [],
      users: string[] = [];
    afterEach(async () => {
      const where = { workspaceId: { in: workspaces } };
      await client.externalReadGrant.deleteMany({ where });
      await client.groupFeatureAuditLog.deleteMany({ where });
      await client.bunshinCapabilityAssignment.deleteMany({ where });
      await client.bunshin.deleteMany({ where });
      await client.workspace.deleteMany({ where: { id: { in: workspaces } } });
      await client.user.deleteMany({ where: { id: { in: users } } });
      workspaces.length = 0;
      users.length = 0;
    });
    async function fixture() {
      const user = await client.user.create({ data: { displayName: 'Synthetic external owner' } });
      users.push(user.id);
      const workspace = await client.workspace.create({
        data: { name: 'Synthetic external', type: 'ORGANIZATION' },
      });
      workspaces.push(workspace.id);
      await client.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: user.id, role: 'MEMBER', status: 'ACTIVE' },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Synthetic external' },
      });
      await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: `ext-${randomUUID()}`,
          displayName: 'Synthetic',
          description: 'Synthetic',
          operatorName: 'Synthetic',
          createdByUserId: user.id,
          updatedByUserId: user.id,
        },
      });
      const member = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: user.id,
          status: 'ACTIVE',
          consentedAt: new Date('2026-11-01'),
        },
      });
      const bunshin = await client.bunshin.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          ownerUserId: user.id,
          slug: randomUUID(),
          name: 'Synthetic',
          type: 'COPY',
          status: 'ACTIVE',
          objectiveSummary: 'Synthetic',
          audienceSummary: 'Synthetic',
          personalitySummary: 'Synthetic',
        },
      });
      await client.bunshinCapabilityAssignment.create({
        data: {
          workspaceId: workspace.id,
          bunshinId: bunshin.id,
          capabilityType: 'SOCIAL',
          status: 'ACTIVE',
          activatedAt: new Date('2026-11-01'),
          assignedByUserId: user.id,
        },
      });
      for (const key of ['SOCIAL', EXTERNAL_READ_FEATURE_KEY]) {
        await client.featureDefinition.upsert({
          where: { key },
          update: {},
          create: { key, name: 'Synthetic', description: 'Synthetic' },
        });
        await client.groupFeaturePolicy.create({
          data: {
            workspaceId: workspace.id,
            groupId: group.id,
            featureKey: key,
            status: 'ENABLED',
            setByUserId: user.id,
          },
        });
        await client.groupMemberFeatureAssignment.create({
          data: {
            workspaceId: workspace.id,
            groupId: group.id,
            groupMembershipId: member.id,
            featureKey: key,
            status: 'ENABLED',
            assignedByUserId: user.id,
          },
        });
      }
      const owner: ExternalGrantOwner = {
        actorUserId: user.id,
        scope: {
          workspaceId: workspace.id,
          serviceId: group.id,
          groupMembershipId: member.id,
          userId: user.id,
          bunshinId: bunshin.id,
        },
      };
      let policy: ExternalGrantServerPolicy = { enabled: true, clients: [principal.clientId] };
      let clock = new Date(epoch);
      const repository = new PrismaExternalReadGrantRepository(
        client,
        'test',
        () => policy,
        () => clock,
      );
      const manager = new ManageExternalReadGrants(repository);
      const command: ExternalGrantIssue = {
        commandId: randomUUID(),
        clientId: principal.clientId,
        operation: 'member-usage:read' as const,
        expiresInMinutes: 60,
        consentVersion: EXTERNAL_READ_CONSENT_VERSION,
      };
      return {
        user,
        workspace,
        group,
        member,
        bunshin,
        owner,
        repository,
        manager,
        command,
        setPolicy: (v: ExternalGrantServerPolicy) => {
          policy = v;
        },
        setClock: (v: Date) => {
          clock = v;
        },
      };
    }
    it('checks issuance eligibility with no probe grant or audit write', async () => {
      const f = await fixture();
      expect(await f.repository.issuanceAllowed(f.owner, principal.clientId)).toBe(true);
      expect(await client.externalReadGrant.count({ where: { workspaceId: f.workspace.id } })).toBe(
        0,
      );
      expect(
        await client.groupFeatureAuditLog.count({ where: { workspaceId: f.workspace.id } }),
      ).toBe(0);
      f.setPolicy({ enabled: false, clients: [principal.clientId] });
      expect(await f.repository.issuanceAllowed(f.owner, principal.clientId)).toBe(false);
    });
    it('persists exactly one immutable scope and audit for concurrent identical issue retries', async () => {
      const f = await fixture();
      const grants = await Promise.all([
        f.manager.issue(f.owner, f.command),
        f.manager.issue(f.owner, f.command),
      ]);
      expect(grants[0]).toEqual(grants[1]);
      expect(grants[0]).toMatchObject({
        connectionId: f.command.commandId,
        scope: f.owner.scope,
        revision: 1,
      });
      expect(await client.externalReadGrant.count({ where: { workspaceId: f.workspace.id } })).toBe(
        1,
      );
      expect(
        await client.groupFeatureAuditLog.count({
          where: { workspaceId: f.workspace.id, action: 'EXTERNAL_READ_GRANTED' },
        }),
      ).toBe(1);
      expect(await f.repository.find(f.command.commandId, principal, signal())).not.toBeNull();
    });
    it('rejects changed retry details and never renews an expired grant', async () => {
      const f = await fixture();
      const issued = await f.manager.issue(f.owner, f.command);
      await expect(
        f.manager.issue(f.owner, { ...f.command, expiresInMinutes: 120 }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      f.setClock(new Date('2026-11-03T02:00:00Z'));
      expect(await f.manager.issue(f.owner, f.command)).toEqual(issued);
      expect(await f.repository.find(issued.connectionId, principal, signal())).toBeNull();
    });
    it('revokes once under concurrent retry and never reactivates on issue replay', async () => {
      const f = await fixture();
      const issued = await f.manager.issue(f.owner, f.command);
      const revoke = { connectionId: issued.connectionId, expectedRevision: 1 };
      const results = await Promise.all([
        f.manager.revoke(f.owner, revoke),
        f.manager.revoke(f.owner, revoke),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect(results[0]?.revision).toBe(2);
      expect(results[0]?.revokedAt).toEqual(epoch);
      expect(await f.repository.find(issued.connectionId, principal, signal())).toBeNull();
      expect(await f.manager.issue(f.owner, f.command)).toEqual(results[0]);
      expect(
        await client.groupFeatureAuditLog.count({
          where: { workspaceId: f.workspace.id, action: 'EXTERNAL_READ_REVOKED' },
        }),
      ).toBe(1);
      await expect(
        f.manager.revoke(f.owner, { ...revoke, expectedRevision: 9 }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
    it.each(['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const)(
      'rejects foreign %s for owner list, issuance and revocation',
      async (key) => {
        const f = await fixture(),
          other = await fixture();
        await f.manager.issue(f.owner, f.command);
        const owner = {
          actorUserId: key === 'userId' ? other.user.id : f.user.id,
          scope: { ...f.owner.scope, [key]: other.owner.scope[key] },
        };
        await expect(f.manager.list(owner)).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(
          f.manager.issue(owner, { ...f.command, commandId: randomUUID() }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(
          f.manager.revoke(owner, { connectionId: f.command.commandId, expectedRevision: 1 }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(await f.repository.find(f.command.commandId, principal, signal())).not.toBeNull();
      },
    );
    it('keeps grants separate for two Bunshin owned by the same member', async () => {
      const f = await fixture();
      await f.manager.issue(f.owner, f.command);
      const other = await client.bunshin.create({
        data: { ...f.bunshin, id: randomUUID(), slug: randomUUID() },
      });
      const second = { ...f.owner, scope: { ...f.owner.scope, bunshinId: other.id } };
      expect(await f.manager.list(second)).toEqual([]);
      await expect(
        f.manager.revoke(second, { connectionId: f.command.commandId, expectedRevision: 1 }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const grant = await f.repository.find(f.command.commandId, principal, signal());
      expect(grant).not.toBeNull();
      expect(
        await f.repository.permitted(
          { ...grant!, scope: second.scope },
          'member-usage:read',
          epoch,
          signal(),
        ),
      ).toBe(false);
    });
    it('does not let another valid owner revoke or replay a known connection ID', async () => {
      const f = await fixture(),
        other = await fixture();
      await f.manager.issue(f.owner, f.command);
      await expect(
        other.manager.revoke(other.owner, {
          connectionId: f.command.commandId,
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(other.manager.issue(other.owner, f.command)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(await other.manager.list(other.owner)).toEqual([]);
    });
    it('matches both authenticated client and server environment', async () => {
      const f = await fixture();
      await f.manager.issue(f.owner, f.command);
      expect(
        await f.repository.find(f.command.commandId, { ...principal, clientId: 'other' }, signal()),
      ).toBeNull();
      expect(
        await f.repository.find(
          f.command.commandId,
          { ...principal, environment: 'production' },
          signal(),
        ),
      ).toBeNull();
      const prod = new PrismaExternalReadGrantRepository(
        client,
        'production',
        () => ({ enabled: true, clients: [principal.clientId] }),
        () => epoch,
      );
      expect(
        await prod.find(f.command.commandId, { ...principal, environment: 'production' }, signal()),
      ).toBeNull();
    });
    it.each([
      'server',
      'client',
      'feature',
      'member-feature',
      'capability',
      'membership',
      'consent',
      'bunshin',
      'feature-expired',
    ])('stops issuance/read on %s but keeps owner revocation available', async (change) => {
      const f = await fixture();
      const issued = await f.manager.issue(f.owner, f.command);
      if (change === 'server') f.setPolicy({ enabled: false, clients: [principal.clientId] });
      if (change === 'client') f.setPolicy({ enabled: true, clients: [] });
      if (change === 'feature')
        await client.groupFeaturePolicy.updateMany({
          where: { groupId: f.group.id, featureKey: EXTERNAL_READ_FEATURE_KEY },
          data: { status: 'DISABLED' },
        });
      if (change === 'member-feature')
        await client.groupMemberFeatureAssignment.updateMany({
          where: { groupMembershipId: f.member.id, featureKey: EXTERNAL_READ_FEATURE_KEY },
          data: { status: 'DISABLED' },
        });
      if (change === 'feature-expired')
        await client.groupFeaturePolicy.updateMany({
          where: { groupId: f.group.id, featureKey: EXTERNAL_READ_FEATURE_KEY },
          data: { endsAt: epoch },
        });
      if (change === 'capability')
        await client.bunshinCapabilityAssignment.updateMany({
          where: { bunshinId: f.bunshin.id },
          data: { status: 'SUSPENDED' },
        });
      if (change === 'membership')
        await client.groupMembership.update({
          where: { id: f.member.id },
          data: { status: 'REVOKED', revokedAt: epoch },
        });
      if (change === 'consent')
        await client.groupMembership.update({
          where: { id: f.member.id },
          data: { consentedAt: new Date('2026-11-04') },
        });
      if (change === 'bunshin')
        await client.bunshin.update({ where: { id: f.bunshin.id }, data: { status: 'ARCHIVED' } });
      expect(await f.repository.find(issued.connectionId, principal, signal())).toBeNull();
      await expect(
        f.manager.issue(f.owner, { ...f.command, commandId: randomUUID() }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(
        (
          await f.manager.revoke(f.owner, {
            connectionId: issued.connectionId,
            expectedRevision: 1,
          })
        ).revokedAt,
      ).not.toBeNull();
    });
    it('requires explicit current consent and keeps default server policy disabled', async () => {
      const f = await fixture();
      expect(() => f.manager.issue(f.owner, { ...f.command, consentVersion: 'old' })).toThrow(
        'invalid external read grant command',
      );
      const repo = new PrismaExternalReadGrantRepository(client, 'test');
      await expect(repo.issue(f.owner, f.command)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await client.externalReadGrant.count({ where: { workspaceId: f.workspace.id } })).toBe(
        0,
      );
    });
    it('serializes the five-active-grant cap and allows new IDs after revocation', async () => {
      const f = await fixture();
      const settled = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          f.manager.issue(f.owner, { ...f.command, commandId: randomUUID() }),
        ),
      );
      expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      const rows = await f.manager.list(f.owner);
      expect(rows).toHaveLength(5);
      await f.manager.revoke(f.owner, { connectionId: rows[0]!.connectionId, expectedRevision: 1 });
      await expect(f.manager.issue(f.owner, f.command)).resolves.toMatchObject({ revision: 1 });
    });
    it('rejects direct database insertion with a foreign membership or Bunshin owner', async () => {
      const f = await fixture(),
        other = await fixture();
      const issued = await f.manager.issue(f.owner, f.command);
      const row = await client.externalReadGrant.findUniqueOrThrow({
        where: { id: issued.connectionId },
      });
      for (const change of [
        { groupMembershipId: other.member.id },
        { bunshinId: other.bunshin.id },
        { userId: other.user.id },
      ]) {
        await expect(
          client.externalReadGrant.create({ data: { ...row, id: randomUUID(), ...change } }),
        ).rejects.toThrow();
      }
      await expect(
        client.externalReadGrant.create({
          data: { ...row, id: randomUUID(), operations: ['publish:write'] },
        }),
      ).rejects.toThrow();
    });
    it('rolls back grant issue/revoke if the shared audit write fails', async () => {
      const f = await fixture();
      const broken = client.$extends({
        query: {
          groupFeatureAuditLog: {
            create() {
              throw new Error('synthetic audit unavailable');
            },
          },
        },
      }) as unknown as PrismaClient;
      const repository = new PrismaExternalReadGrantRepository(
        broken,
        'test',
        () => ({ enabled: true, clients: [principal.clientId] }),
        () => epoch,
      );
      await expect(repository.issue(f.owner, f.command)).rejects.toThrow('synthetic audit');
      expect(await f.manager.list(f.owner)).toEqual([]);
      await f.manager.issue(f.owner, f.command);
      await expect(
        repository.revoke(f.owner, { connectionId: f.command.commandId, expectedRevision: 1 }),
      ).rejects.toThrow('synthetic audit');
      expect(await f.repository.find(f.command.commandId, principal, signal())).not.toBeNull();
    });
    it('connects persisted grants to the usage Core and discards a result on concurrent owner revoke', async () => {
      const f = await fixture();
      await f.manager.issue(f.owner, f.command);
      const usage = new PrismaMemberUsageRepository(client, () => epoch);
      const release = vi.fn();
      const ports: ExternalReadPorts = {
        grants: f.repository,
        authorization: f.repository,
        admission: { reserve: () => Promise.resolve({ release }) },
        audit: { record: () => Promise.resolve() },
      };
      const reader = new ReadExternalMemberUsage(ports, usage, usage, () => epoch);
      await expect(
        reader.execute(principal, { connectionId: f.command.commandId, requestId: randomUUID() }),
      ).resolves.toMatchObject({ postEvidence: 'SELF_REPORTED_NOT_VERIFIED' });
      const revokedSources = {
        read: async (input: Parameters<typeof usage.read>[0]) => {
          const result = await usage.read(input);
          await f.manager.revoke(f.owner, {
            connectionId: f.command.commandId,
            expectedRevision: 1,
          });
          return result;
        },
      };
      const concurrent = new ReadExternalMemberUsage(ports, usage, revokedSources, () => epoch);
      await expect(
        concurrent.execute(principal, {
          connectionId: f.command.commandId,
          requestId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'DENIED' });
      expect(release).toHaveBeenCalledTimes(2);
    });
  });
}
