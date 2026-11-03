import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ServiceLineBroadcastAudienceService } from '@bunshin/application';
import { PrismaServiceLineBroadcastAudienceRepository } from '../src/service-line-broadcast-audience-repository';
import { PrismaServiceLineBroadcastOperationsRepository } from '../src/service-line-broadcast-operations-repository';
import { PrismaJobRepository } from '../src/automation-jobs';

/** Registered only inside the live disposable-database preflight in database.integration.test.ts. */
export function registerBroadcastConfirmationIntegrationCases(client: PrismaClient) {
  describe('LINE broadcast confirmation PostgreSQL', () => {
    const workspaces: string[] = [];
    const users: string[] = [];
    afterEach(async () => {
      const where = { workspaceId: { in: workspaces } };
      await client.job.deleteMany({ where });
      await client.serviceLineBroadcast.deleteMany({ where });
      await client.groupLineConnection.deleteMany({ where });
      await client.groupLineChannelConfiguration.deleteMany({ where });
      await client.serviceConfiguration.deleteMany({ where });
      await client.groupMembership.deleteMany({ where });
      await client.group.deleteMany({ where });
      await client.workspaceMembership.deleteMany({ where });
      await client.workspace.deleteMany({ where: { id: { in: workspaces } } });
      await client.user.deleteMany({ where: { id: { in: users } } });
      workspaces.length = 0;
      users.length = 0;
    });
    async function fixture() {
      let clock = new Date('2026-11-03T01:00:00Z');
      const owner = await client.user.create({
        data: { displayName: 'Synthetic broadcast manager' },
      });
      const member = await client.user.create({ data: { displayName: 'Synthetic recipient' } });
      users.push(owner.id, member.id);
      const workspace = await client.workspace.create({
        data: { name: 'Synthetic LINE test', type: 'ORGANIZATION' },
      });
      workspaces.push(workspace.id);
      await client.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: owner.id, role: 'OWNER' },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Synthetic LINE service' },
      });
      await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: `broadcast-${randomUUID()}`,
          displayName: 'Synthetic LINE service',
          description: 'Synthetic only',
          operatorName: 'Synthetic',
          createdByUserId: owner.id,
          updatedByUserId: owner.id,
        },
      });
      const scope = { workspaceId: workspace.id, groupId: group.id, actorUserId: owner.id };
      await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: owner.id,
          serviceRole: 'SERVICE_OWNER',
          status: 'ACTIVE',
          consentedAt: clock,
        },
      });
      const membership = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: member.id,
          serviceRole: 'PARTICIPANT',
          status: 'ACTIVE',
          consentedAt: clock,
        },
      });
      const configuration = await client.groupLineChannelConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          environment: 'STAGING',
          version: 1,
          status: 'ACTIVE',
          loginChannelId: 'synthetic-login',
          messagingChannelId: 'synthetic-messaging',
          encryptedLoginSecret: 'synthetic-only',
          encryptedMessagingSecret: 'synthetic-only',
          encryptedAccessToken: 'synthetic-only',
          loginSecretMask: '***',
          messagingSecretMask: '***',
          accessTokenMask: '***',
          globallyPaused: false,
          lastVerifiedAt: clock,
          createdByUserId: owner.id,
        },
      });
      await client.groupLineConnection.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          groupMembershipId: membership.id,
          userId: member.id,
          configurationId: configuration.id,
          providerUserId: `U-synthetic-${randomUUID()}`,
          friendshipStatus: 'FOLLOWING',
          notificationConsentAt: clock,
        },
      });
      const repo = new PrismaServiceLineBroadcastAudienceRepository(client, () => clock);
      const operationId = randomUUID();
      const command = {
        ...scope,
        environment: 'STAGING' as const,
        operationId,
        immediate: true as const,
        title: 'Synthetic title',
        message: 'Synthetic message',
        reason: 'Synthetic confirmation',
        scheduledAt: clock,
        expectedRecipientCount: 1,
        segment: { industryIds: [], purposes: [] },
      };
      return {
        scope,
        member,
        membership,
        configuration,
        repo,
        command,
        setClock: (date: Date) => {
          clock = date;
        },
      };
    }
    it('serializes concurrent identical requests and retains one snapshot, audit and Job', async () => {
      const f = await fixture();
      const results = await Promise.all([f.repo.schedule(f.command), f.repo.schedule(f.command)]);
      expect(results.map((r) => r.kind === 'SCHEDULED' && r.replayed).sort()).toEqual([
        false,
        true,
      ]);
      const where = { workspaceId: f.scope.workspaceId, groupId: f.scope.groupId };
      expect(await client.serviceLineBroadcast.count({ where })).toBe(1);
      expect(await client.serviceLineBroadcastRecipient.count({ where })).toBe(1);
      expect(await client.serviceLineBroadcastAuditLog.count({ where })).toBe(1);
      const jobs = new PrismaJobRepository(client);
      const job = {
        environment: 'STAGING' as const,
        workspaceId: f.scope.workspaceId,
        requestedBy: f.scope.actorUserId,
        jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
        correlationId: `service-line-broadcast:${f.command.operationId}`,
        payloadReference: `service-line-broadcast:${f.command.operationId}`,
        idempotencyKey: `service-line-broadcast:${f.command.operationId}:attempt:1`,
      };
      expect((await jobs.enqueue(job)).id).toBe((await jobs.enqueue(job)).id);
      expect(await client.job.count({ where: { workspaceId: f.scope.workspaceId } })).toBe(1);
      const audit = await client.serviceLineBroadcastAuditLog.findFirstOrThrow({ where });
      const afterData = audit.afterData as { requestFingerprint: unknown; recipients: unknown };
      expect(afterData.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(afterData.recipients).toBe(1);
      f.setClock(new Date('2026-11-04T01:00:00Z'));
      await expect(
        f.repo.schedule({ ...f.command, scheduledAt: new Date('2026-11-04T01:00:00Z') }),
      ).resolves.toMatchObject({
        kind: 'SCHEDULED',
        replayed: true,
        scheduledAt: f.command.scheduledAt,
      });
    });
    it('rejects changed inputs, foreign scope and revoked authority even on replay', async () => {
      const f = await fixture();
      const other = await fixture();
      await f.repo.schedule(f.command);
      for (const change of [
        { message: 'Changed' },
        { reason: 'Changed' },
        { expectedRecipientCount: 2 },
        { immediate: undefined, scheduledAt: new Date('2026-12-01') },
      ])
        await expect(
          f.repo.schedule({ ...f.command, ...change } as typeof f.command),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        other.repo.schedule({ ...other.command, operationId: f.command.operationId }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(
        await client.serviceLineBroadcast.count({
          where: { workspaceId: other.scope.workspaceId },
        }),
      ).toBe(0);
      await expect(
        other.repo.schedule({ ...other.command, actorUserId: f.scope.actorUserId }),
      ).resolves.toEqual({ kind: 'ACCESS_DENIED' });
      await expect(f.repo.schedule({ ...f.command, actorUserId: f.member.id })).resolves.toEqual({
        kind: 'ACCESS_DENIED',
      });
      await client.groupMembership.updateMany({
        where: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          userId: f.scope.actorUserId,
        },
        data: { status: 'REVOKED', revokedAt: new Date('2026-11-03T01:01:00Z') },
      });
      await expect(f.repo.schedule(f.command)).resolves.toEqual({ kind: 'ACCESS_DENIED' });
    });
    it('rolls back snapshot and reservation if the existing audit fails', async () => {
      const f = await fixture();
      const broken = client.$extends({
        query: {
          serviceLineBroadcastAuditLog: {
            create() {
              throw new Error('synthetic audit unavailable');
            },
          },
        },
      }) as unknown as PrismaClient;
      await expect(
        new PrismaServiceLineBroadcastAudienceRepository(
          broken,
          () => f.command.scheduledAt,
        ).schedule(f.command),
      ).rejects.toThrow('synthetic audit unavailable');
      const where = { workspaceId: f.scope.workspaceId, groupId: f.scope.groupId };
      expect(await client.serviceLineBroadcast.count({ where })).toBe(0);
      expect(await client.serviceLineBroadcastRecipient.count({ where })).toBe(0);
      expect(await client.serviceLineBroadcastAuditLog.count({ where })).toBe(0);
      await expect(f.repo.schedule(f.command)).resolves.toMatchObject({
        kind: 'SCHEDULED',
        replayed: false,
      });
    });
    it('preserves no-recipient/count/configuration gates for new operations, and does not reschedule cancelled operations', async () => {
      const f = await fixture();
      await expect(f.repo.schedule({ ...f.command, expectedRecipientCount: 2 })).resolves.toEqual({
        kind: 'RECIPIENT_COUNT_CHANGED',
      });
      await client.groupLineConnection.updateMany({
        where: { workspaceId: f.scope.workspaceId },
        data: { notificationConsentAt: null },
      });
      await expect(f.repo.schedule(f.command)).resolves.toEqual({ kind: 'NO_RECIPIENTS' });
      await client.groupLineConnection.updateMany({
        where: { workspaceId: f.scope.workspaceId },
        data: { notificationConsentAt: f.command.scheduledAt },
      });
      await client.groupLineChannelConfiguration.update({
        where: { id: f.configuration.id },
        data: { globallyPaused: true },
      });
      await expect(f.repo.schedule(f.command)).resolves.toEqual({
        kind: 'CONFIGURATION_UNAVAILABLE',
      });
      await client.groupLineChannelConfiguration.update({
        where: { id: f.configuration.id },
        data: { globallyPaused: false },
      });
      await f.repo.schedule(f.command);
      await client.serviceLineBroadcast.update({
        where: { id: f.command.operationId },
        data: { status: 'CANCELLED' },
      });
      await client.job.deleteMany({ where: { workspaceId: f.scope.workspaceId } });
      await expect(f.repo.schedule(f.command)).resolves.toMatchObject({
        replayed: true,
        status: 'CANCELLED',
      });
      expect(
        (
          await client.serviceLineBroadcast.findUniqueOrThrow({
            where: { id: f.command.operationId },
          })
        ).status,
      ).toBe('CANCELLED');
      expect(await client.job.count({ where: { workspaceId: f.scope.workspaceId } })).toBe(0);
    });
    it('rolls back all records when Job permission or write fails', async () => {
      const f = await fixture();
      const where = { workspaceId: f.scope.workspaceId, groupId: f.scope.groupId };
      await client.workspaceMembership.updateMany({
        where: { workspaceId: f.scope.workspaceId, userId: f.scope.actorUserId },
        data: { status: 'REVOKED' },
      });
      await expect(f.repo.schedule(f.command)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await client.serviceLineBroadcast.count({ where })).toBe(0);
      expect(await client.serviceLineBroadcastRecipient.count({ where })).toBe(0);
      expect(await client.serviceLineBroadcastAuditLog.count({ where })).toBe(0);
      await client.workspaceMembership.updateMany({
        where: { workspaceId: f.scope.workspaceId, userId: f.scope.actorUserId },
        data: { status: 'ACTIVE' },
      });
      const broken = client.$extends({
        query: {
          job: {
            upsert() {
              throw new Error('synthetic queue unavailable');
            },
          },
        },
      }) as unknown as PrismaClient;
      await expect(
        new PrismaServiceLineBroadcastAudienceRepository(
          broken,
          () => f.command.scheduledAt,
        ).schedule(f.command),
      ).rejects.toThrow('synthetic queue unavailable');
      expect(await client.serviceLineBroadcast.count({ where })).toBe(0);
      expect(await client.serviceLineBroadcastRecipient.count({ where })).toBe(0);
      expect(await client.serviceLineBroadcastAuditLog.count({ where })).toBe(0);
      expect(await client.job.count({ where: { workspaceId: f.scope.workspaceId } })).toBe(0);
      await expect(f.repo.schedule(f.command)).resolves.toMatchObject({ replayed: false });
      expect(await client.job.count({ where: { workspaceId: f.scope.workspaceId } })).toBe(1);
    });
    it('allows result recovery after a specified date passes but rejects a new expired reservation', async () => {
      const f = await fixture();
      const { immediate, ...command } = f.command;
      expect(immediate).toBe(true);
      const clock = new Date('2026-11-05T00:00:00Z');
      await f.repo.schedule(command);
      f.setClock(clock);
      await expect(
        new ServiceLineBroadcastAudienceService(f.repo, () => clock).schedule(command),
      ).resolves.toMatchObject({ replayed: true });
      await expect(
        f.repo.schedule({ ...command, operationId: randomUUID() }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    async function completedBroadcastFixture() {
      const f = await fixture();
      await f.repo.schedule(f.command);
      const where = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        broadcastId: f.command.operationId,
      };
      const completedAt = new Date('2026-11-03T01:05:00Z');
      const scheduledAt = new Date('2026-11-03T01:06:00Z');
      await client.serviceLineBroadcast.update({
        where: { id: where.broadcastId },
        data: { status: 'COMPLETED', completedAt },
      });
      await client.serviceLineBroadcastRecipient.updateMany({
        where,
        data: { status: 'FAILED', errorCategory: 'SYNTHETIC_PROVIDER_ERROR' },
      });
      const sentMembership = await client.groupMembership.findFirstOrThrow({
        where: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          userId: f.scope.actorUserId,
        },
      });
      await client.serviceLineBroadcastRecipient.create({
        data: {
          ...where,
          groupMembershipId: sentMembership.id,
          userId: f.scope.actorUserId,
          status: 'SENT',
          deliveredAt: completedAt,
        },
      });
      await client.job.updateMany({
        where: { workspaceId: f.scope.workspaceId },
        data: { status: 'SUCCEEDED', completedAt, attemptCount: 1 },
      });
      return {
        ...f,
        where,
        retry: {
          ...where,
          actorUserId: f.scope.actorUserId,
          environment: f.command.environment,
          reason: 'Synthetic retry',
          scheduledAt,
        },
      };
    }

    it('commits one retry Job under concurrent requests and leaves sent recipients unchanged through cancellation', async () => {
      const f = await completedBroadcastFixture();
      const other = await fixture();
      const operations = new PrismaServiceLineBroadcastOperationsRepository(client);
      await expect(operations.retry({ ...f.retry, ...other.scope })).resolves.toEqual({
        kind: 'CANNOT_RETRY',
      });
      const results = await Promise.all([operations.retry(f.retry), operations.retry(f.retry)]);
      expect(results.map((result) => result.kind).sort()).toEqual(['CANNOT_RETRY', 'SCHEDULED']);
      expect(
        await client.serviceLineBroadcastAuditLog.count({
          where: { ...f.where, action: 'RETRY_REQUESTED' },
        }),
      ).toBe(1);
      const retryJob = await client.job.findFirstOrThrow({
        where: { workspaceId: f.scope.workspaceId, status: 'PENDING' },
      });
      expect(retryJob).toMatchObject({
        scheduledAt: f.retry.scheduledAt,
        payloadReference: `service-line-broadcast:${f.where.broadcastId}`,
        idempotencyKey: `service-line-broadcast:${f.where.broadcastId}:attempt:${f.retry.scheduledAt.getTime()}`,
        requestedBy: f.scope.actorUserId,
        maxAttempts: 3,
        priority: 40,
      });
      expect(await client.job.count({ where: { workspaceId: f.scope.workspaceId } })).toBe(2);
      expect(
        await client.serviceLineBroadcastRecipient.count({
          where: { ...f.where, status: 'PENDING' },
        }),
      ).toBe(1);
      await expect(
        operations.cancel({ ...f.retry, cancelledAt: new Date('2026-11-03T01:07:00Z') }),
      ).resolves.toMatchObject({ kind: 'CANCELLED' });
      expect(
        await client.serviceLineBroadcastRecipient.count({ where: { ...f.where, status: 'SENT' } }),
      ).toBe(1);
      expect(
        await client.serviceLineBroadcastRecipient.count({
          where: { ...f.where, status: 'CANCELLED' },
        }),
      ).toBe(1);
      expect(await client.job.findUniqueOrThrow({ where: { id: retryJob.id } })).toMatchObject({
        status: 'CANCELLED',
      });
    });

    it('rolls back retry state when audit, job writing or job permission fails', async () => {
      const f = await completedBroadcastFixture();
      const brokenAudit = client.$extends({
        query: {
          serviceLineBroadcastAuditLog: {
            create() {
              throw new Error('synthetic retry audit unavailable');
            },
          },
        },
      }) as unknown as PrismaClient;
      await expect(
        new PrismaServiceLineBroadcastOperationsRepository(brokenAudit).retry(f.retry),
      ).rejects.toThrow('synthetic retry audit unavailable');
      const broken = client.$extends({
        query: {
          job: {
            upsert() {
              throw new Error('synthetic retry queue unavailable');
            },
          },
        },
      }) as unknown as PrismaClient;
      const operations = new PrismaServiceLineBroadcastOperationsRepository(client);
      await expect(
        new PrismaServiceLineBroadcastOperationsRepository(broken).retry(f.retry),
      ).rejects.toThrow('synthetic retry queue unavailable');
      await client.workspaceMembership.updateMany({
        where: { workspaceId: f.scope.workspaceId, userId: f.scope.actorUserId },
        data: { status: 'REVOKED' },
      });
      await expect(operations.retry(f.retry)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(
        await client.serviceLineBroadcast.findUniqueOrThrow({ where: { id: f.where.broadcastId } }),
      ).toMatchObject({ status: 'COMPLETED' });
      expect(
        await client.serviceLineBroadcastRecipient.findFirstOrThrow({
          where: { ...f.where, userId: f.member.id },
        }),
      ).toMatchObject({ status: 'FAILED', errorCategory: 'SYNTHETIC_PROVIDER_ERROR' });
      expect(
        await client.serviceLineBroadcastAuditLog.count({
          where: { ...f.where, action: 'RETRY_REQUESTED' },
        }),
      ).toBe(0);
      expect(await client.job.count({ where: { workspaceId: f.scope.workspaceId } })).toBe(1);
    });
  });
}
