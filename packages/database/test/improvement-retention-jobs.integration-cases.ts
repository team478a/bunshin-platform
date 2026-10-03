import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { platformJob } from '../src/job-mapping';
import {
  ClaimJob,
  CreateUserWithPersonalWorkspace,
  ExecuteImprovementFeedbackRetentionJob,
  FailJob,
  improvementFeedbackPurgePayload,
} from '@bunshin/application';
import {
  PrismaAccountUnitOfWork,
  PrismaImprovementFeedbackRetentionJobRepository,
  PrismaJobRepository,
  PrismaAccountDeletionRequestRepository,
  PrismaAccountDeletionExecutionRepository,
  PrismaAccountDeletionPurgeRepository,
} from '../src';

const now = new Date('2026-10-03T03:00:00Z');
const day = 86_400_000;
/** Registered under the existing localhost/non-production integration guard. */
export function registerImprovementRetentionJobIntegrationCases(client: PrismaClient) {
  describe('feedback retention existing Job isolated PostgreSQL', () => {
    beforeEach(() =>
      vi.stubGlobal('fetch', () => {
        throw new Error('external network forbidden');
      }),
    );
    afterEach(() => vi.unstubAllGlobals());
    async function fixture(count = 1) {
      const account = await new CreateUserWithPersonalWorkspace(
        new PrismaAccountUnitOfWork(client),
      ).execute({ displayName: 'Synthetic retention manager' });
      const workspaceId = account.workspace.id;
      const group = await client.group.create({
        data: { workspaceId, name: 'Synthetic retention' },
      });
      const bunshin = await client.bunshin.create({
        data: {
          workspaceId,
          groupId: group.id,
          ownerUserId: account.user.id,
          name: 'Synthetic',
          slug: randomUUID(),
          type: 'COPY',
          objectiveSummary: 'O',
          audienceSummary: 'A',
          personalitySummary: 'P',
        },
      });
      const source = (createdAt: Date) =>
        client.improvementFeedback.create({
          data: {
            workspaceId,
            serviceId: group.id,
            actorUserId: account.user.id,
            bunshinId: bunshin.id,
            packageKey: 'SOCIAL',
            category: 'OPERATION',
            surface: 'TODAY',
            impact: 'BLOCKED',
            submissionKey: randomUUID(),
            createdAt,
          },
        });
      for (let i = 0; i < count; i++) await source(new Date(now.getTime() - 90 * day));
      const repo = (clock = () => now) =>
        new PrismaImprovementFeedbackRetentionJobRepository(client, clock);
      const leased = async () =>
        platformJob(
          await client.job.create({
            data: {
              workspaceId,
              requestedBy: null,
              environment: 'STAGING',
              jobType: 'IMPROVEMENT_FEEDBACK_PURGE',
              payloadReference: improvementFeedbackPurgePayload(group.id),
              idempotencyKey: `${improvementFeedbackPurgePayload(group.id)}:2026-10-03`,
              correlationId: 'feedback-retention-v1',
              scheduledAt: now,
              status: 'LEASED',
              leaseOwner: 'retention-worker',
              leaseExpiresAt: new Date(now.getTime() + 300_000),
              attemptCount: 1,
              priority: 0,
            },
          }),
        );
      const remaining = () =>
        client.improvementFeedback.count({ where: { workspaceId, serviceId: group.id } });
      return { account, workspaceId, group, bunshin, source, repo, leased, remaining };
    }

    it('retention Job: concurrent schedulers deduplicate; suspended scope and expired member remain eligible', async () => {
      const f = await fixture();
      await client.group.update({ where: { id: f.group.id }, data: { status: 'ARCHIVED' } });
      await client.workspace.update({
        where: { id: f.workspaceId },
        data: { status: 'SUSPENDED' },
      });
      await client.workspaceMembership.updateMany({
        where: { workspaceId: f.workspaceId },
        data: { status: 'REVOKED' },
      });
      await Promise.all([f.repo().schedule('STAGING'), f.repo().schedule('STAGING')]);
      const queued = await client.job.findMany({
        where: { workspaceId: f.workspaceId, jobType: 'IMPROVEMENT_FEEDBACK_PURGE' },
      });
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({
        status: 'PENDING',
        requestedBy: null,
        payloadReference: improvementFeedbackPurgePayload(f.group.id),
      });
      await f.repo(() => new Date(now.getTime() + day)).schedule('STAGING');
      expect(
        await client.job.count({
          where: { workspaceId: f.workspaceId, jobType: 'IMPROVEMENT_FEEDBACK_PURGE' },
        }),
      ).toBe(1);
      await client.job.update({ where: { id: queued[0]!.id }, data: { priority: 0 } });
      const claimed = await new ClaimJob(
        new PrismaJobRepository(client),
        300_000,
        () => now,
      ).execute('STAGING', 'retention-worker');
      expect(claimed?.id).toBe(queued[0]!.id);
      expect((await f.repo().execute(claimed!, 'retention-worker')).status).toBe('SUCCEEDED');
      expect(await f.remaining()).toBe(0);
    });

    it('retention Job: exact 90-day boundary, bounded continuation and fresh-instance resume preserve fresh/sibling data', async () => {
      const f = await fixture(101);
      const sibling = await fixture();
      await f.source(new Date(now.getTime() - 90 * day + 1));
      await f.source(now);
      const job = await f.leased();
      const first = await f.repo().execute(job, 'retention-worker');
      expect(first).toMatchObject({
        status: 'RETRY_SCHEDULED',
        attemptCount: 0,
        leaseOwner: null,
        nextRetryAt: new Date(now.getTime() + 60_000),
        completedAt: null,
      });
      expect(await f.remaining()).toBe(3);
      expect(await sibling.remaining()).toBe(1);
      // A new execution uses persisted Job state, never previous in-memory deletion lists.
      const later = new Date(now.getTime() + 60_001);
      const claimed = await new ClaimJob(
        new PrismaJobRepository(client),
        300_000,
        () => later,
      ).execute('STAGING', 'second-worker');
      expect(claimed?.id).toBe(job.id);
      const done = await f.repo(() => later).execute(claimed!, 'second-worker');
      expect(done.status).toBe('SUCCEEDED');
      expect(await f.remaining()).toBe(1);
      expect(await sibling.remaining()).toBe(1);
      await expect(f.repo(() => later).execute(claimed!, 'second-worker')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('retention Job: stored scope/environment/payload and lease reject forged or stale execution', async () => {
      const f = await fixture();
      const job = await f.leased();
      for (const changed of [
        { workspaceId: randomUUID() },
        { environment: 'PRODUCTION' as const },
        { attemptCount: job.attemptCount + 1 },
        { leaseExpiresAt: new Date(job.leaseExpiresAt!.getTime() + 1) },
        { payloadReference: improvementFeedbackPurgePayload(randomUUID()) },
      ])
        await expect(
          f.repo().execute({ ...job, ...changed }, 'retention-worker'),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(f.repo().execute(job, 'wrong-worker')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      await expect(
        f.repo(() => new Date(now.getTime() + 300_000)).execute(job, 'retention-worker'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(await f.remaining()).toBe(1);
      expect((await client.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('LEASED');
    });

    it('retention Job: expiry during purge rolls back both deletion and Job transition', async () => {
      const f = await fixture();
      const job = await f.leased();
      const clock = vi
        .fn()
        .mockReturnValueOnce(now)
        .mockReturnValue(new Date(now.getTime() + 300_000));
      await expect(f.repo(clock).execute(job, 'retention-worker')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(await f.remaining()).toBe(1);
      expect((await client.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('LEASED');
      await client.job.update({ where: { id: job.id }, data: { leaseExpiresAt: now } });
      const claimed = await new ClaimJob(
        new PrismaJobRepository(client),
        300_000,
        () => now,
      ).execute('STAGING', 'new-worker');
      expect(claimed?.id).toBe(job.id);
      expect((await f.repo().execute(claimed!, 'new-worker')).status).toBe('SUCCEEDED');
    });

    it('retention Job: concurrent duplicate delivery has one commit and rejects replay after lost response', async () => {
      const f = await fixture();
      const job = await f.leased();
      const results = await Promise.allSettled([
        f.repo().execute(job, 'retention-worker'),
        f.repo().execute(job, 'retention-worker'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await f.remaining()).toBe(0);
      expect((await client.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
        'SUCCEEDED',
      );
      await expect(f.repo().execute(job, 'retention-worker')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('retention Job: expiry after Job update still rolls back before transaction return', async () => {
      const f = await fixture();
      const job = await f.leased();
      const clock = vi
        .fn()
        .mockReturnValueOnce(now)
        .mockReturnValueOnce(now)
        .mockReturnValue(new Date(now.getTime() + 300_000));
      await expect(f.repo(clock).execute(job, 'retention-worker')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(await f.remaining()).toBe(1);
      expect((await client.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('LEASED');
    });

    it('retention Job: CANCELLED replay refuses deletion; ownerless scope schedules next day without borrowing a User', async () => {
      const f = await fixture();
      const job = await f.leased();
      await client.job.update({
        where: { id: job.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      await expect(f.repo().execute(job, 'retention-worker')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      await client.workspaceMembership.deleteMany({ where: { workspaceId: f.workspaceId } });
      const inspection = await f.repo(() => new Date(now.getTime() + day)).schedule('STAGING');
      expect(inspection.orphanedScopesDetected).toBe(true);
      expect(await client.job.count({ where: { workspaceId: f.workspaceId } })).toBe(2);
      const next = await client.job.findFirstOrThrow({
        where: { workspaceId: f.workspaceId, status: 'PENDING' },
      });
      expect(next.requestedBy).toBeNull();
      const later = new Date(now.getTime() + day);
      const claimed = await new ClaimJob(
        new PrismaJobRepository(client),
        300_000,
        () => later,
      ).execute('STAGING', 'orphan-worker');
      expect(claimed?.id).toBe(next.id);
      expect((await f.repo(() => later).execute(claimed!, 'orphan-worker')).status).toBe(
        'SUCCEEDED',
      );
      expect(await f.remaining()).toBe(0);
    });

    it('retention Job: Job-write fault rolls back raw deletion; existing failure/reclaim resumes after recovery', async () => {
      const f = await fixture();
      const job = await f.leased();
      await client.$executeRawUnsafe(
        `CREATE FUNCTION test_retention_job_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic completion fault'; END $$`,
      );
      await client.$executeRawUnsafe(
        `CREATE TRIGGER test_retention_job_fault BEFORE UPDATE ON jobs FOR EACH ROW WHEN (OLD.id = '${job.id}'::uuid AND NEW.status = 'SUCCEEDED') EXECUTE FUNCTION test_retention_job_fault()`,
      );
      try {
        const result = await new ExecuteImprovementFeedbackRetentionJob(
          f.repo(),
          new FailJob(new PrismaJobRepository(client), () => now),
        ).execute(job, 'retention-worker');
        expect(result).toMatchObject({
          status: 'RETRY_SCHEDULED',
          lastErrorCategory: 'FEEDBACK_RETENTION_FAILED',
          attemptCount: 1,
        });
        expect(await f.remaining()).toBe(1);
      } finally {
        await client.$executeRawUnsafe('DROP TRIGGER test_retention_job_fault ON jobs');
        await client.$executeRawUnsafe('DROP FUNCTION test_retention_job_fault()');
      }
      const later = new Date(now.getTime() + 30_001);
      const claimed = await new ClaimJob(
        new PrismaJobRepository(client),
        300_000,
        () => later,
      ).execute('STAGING', 'recovery-worker');
      expect(claimed?.id).toBe(job.id);
      expect((await f.repo(() => later).execute(claimed!, 'recovery-worker')).status).toBe(
        'SUCCEEDED',
      );
      expect(await f.remaining()).toBe(0);
    });

    it('retention Job: exhausted infrastructure failure becomes DEAD without extending data expiry', async () => {
      const f = await fixture();
      const job = await f.leased();
      await client.job.update({ where: { id: job.id }, data: { attemptCount: 5 } });
      const exhausted = { ...job, attemptCount: 5 };
      const result = await new ExecuteImprovementFeedbackRetentionJob(
        {
          schedule: (environment) => f.repo().schedule(environment),
          execute: () => Promise.reject(new Error('synthetic outage')),
        },
        new FailJob(new PrismaJobRepository(client), () => now),
      ).execute(exhausted, 'retention-worker');
      expect(result).toMatchObject({ status: 'DEAD', nextRetryAt: null, attemptCount: 5 });
      expect(await f.remaining()).toBe(1);
      await f.repo().schedule('STAGING');
      expect(await client.job.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
      await f.repo(() => new Date(now.getTime() + day)).schedule('STAGING');
      expect(await client.job.count({ where: { workspaceId: f.workspaceId } })).toBe(2);
    });

    it('retention Job: expired Candidate and 180-day audit purge without reading raw evidence', async () => {
      const f = await fixture(0);
      const from = new Date('2026-05-31T15:00:00Z');
      const to = new Date(from.getTime() + 7 * day);
      const scope = {
        tenantRef: f.workspaceId,
        workspaceId: f.workspaceId,
        serviceId: f.group.id,
        environment: 'PRODUCTION',
        packageKey: 'SOCIAL',
        adapterKey: 'TROUBLE_FEEDBACK',
      };
      const candidate = await client.improvementTriageCandidate.create({
        data: {
          ...scope,
          fromInclusive: from,
          toExclusive: to,
          clusterRef: 'a'.repeat(64),
          state: 'STALE',
          adapterVersion: 'trouble-feedback-v1',
          ruleVersion: 'selected-feedback-review-v1',
          disclosurePolicyVersion: 'feedback-admin-preview-v1',
          retentionPolicyVersion: 'feedback-retention-v1',
          expiresAt: new Date(to.getTime() + 90 * day),
        },
      });
      const audit = async (occurredAt: Date) =>
        client.improvementTriageOperation.create({
          data: {
            ...scope,
            candidateId: candidate.id,
            actorUserId: f.account.user.id,
            operationKey: randomUUID(),
            expectedCandidateRevision: 1,
            action: 'MARK_REVIEWED',
            reasonCode: 'REVIEW_COMPLETED',
            resultRevision: 2,
            resultState: 'REVIEWED',
            occurredAt,
            expiresAt: new Date(occurredAt.getTime() + 180 * day),
          },
        });
      const old = await audit(new Date(now.getTime() - 180 * day));
      const fresh = await audit(new Date(now.getTime() - 180 * day + 1));
      const job = await f.leased();
      expect((await f.repo().execute(job, 'retention-worker')).status).toBe('SUCCEEDED');
      expect(
        await client.improvementTriageCandidate.findUnique({ where: { id: candidate.id } }),
      ).toBeNull();
      expect(
        await client.improvementTriageOperation.findUnique({ where: { id: old.id } }),
      ).toBeNull();
      expect(
        await client.improvementTriageOperation.findUnique({ where: { id: fresh.id } }),
      ).toMatchObject({ candidateId: null, expiresAt: fresh.expiresAt });
    });

    it('safety regression: retirement cancels User Job but does not cancel maintenance or reattach deleted member', async () => {
      const f = await fixture();
      const from = new Date('2026-05-31T15:00:00Z');
      const to = new Date(from.getTime() + 7 * day);
      const expiredCandidate = await client.improvementTriageCandidate.create({
        data: {
          tenantRef: f.workspaceId,
          workspaceId: f.workspaceId,
          serviceId: f.group.id,
          environment: 'STAGING',
          packageKey: 'SOCIAL',
          adapterKey: 'TROUBLE_FEEDBACK',
          fromInclusive: from,
          toExclusive: to,
          clusterRef: 'b'.repeat(64),
          state: 'STALE',
          adapterVersion: 'trouble-feedback-v1',
          ruleVersion: 'selected-feedback-review-v1',
          disclosurePolicyVersion: 'feedback-admin-preview-v1',
          retentionPolicyVersion: 'feedback-retention-v1',
          expiresAt: new Date(to.getTime() + 90 * day),
        },
      });
      const job = await f.leased();
      const userJob = await client.job.create({
        data: {
          workspaceId: f.workspaceId,
          requestedBy: f.account.user.id,
          environment: 'STAGING',
          jobType: 'SYNTHETIC_USER_JOB',
          payloadReference: 'synthetic',
          idempotencyKey: randomUUID(),
          correlationId: 'synthetic',
          status: 'LEASED',
          leaseOwner: 'synthetic-user',
          leaseExpiresAt: new Date(now.getTime() + 300_000),
        },
      });
      const sibling = await fixture();
      const siblingJob = await sibling.leased();
      const request = await new PrismaAccountDeletionRequestRepository(client).request(
        f.account.user.id,
        new Date(now.getTime() - 14 * day),
      );
      expect(request).not.toBeNull();
      const claimed = await new PrismaAccountDeletionExecutionRepository(
        client,
      ).claimAndSuspendNext({
        workerId: 'synthetic-retirement',
        now,
        leaseExpiresAt: new Date(now.getTime() + 300_000),
        executionVersion: 1,
      });
      expect(claimed).toMatchObject({ requestId: request!.id, status: 'PROCESSING' });
      expect(await client.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
        status: 'LEASED',
        leaseOwner: 'retention-worker',
        requestedBy: null,
        lastErrorCategory: null,
      });
      expect(await client.job.findUniqueOrThrow({ where: { id: userJob.id } })).toMatchObject({
        status: 'CANCELLED',
        requestedBy: f.account.user.id,
        lastErrorCategory: 'ACCOUNT_DELETION_REQUESTED',
      });
      expect(await client.job.findUniqueOrThrow({ where: { id: siblingJob.id } })).toMatchObject({
        status: 'LEASED',
        requestedBy: null,
      });
      // No Auth API/Storage: direct repository call assumes Auth deletion already confirmed.
      expect(
        await new PrismaAccountDeletionPurgeRepository(client).completeAfterAuthDeletion({
          requestId: request!.id,
          userId: f.account.user.id,
          workerId: 'synthetic-retirement',
          now,
        }),
      ).toMatchObject({ status: 'COMPLETED' });
      expect(
        await client.user.findUniqueOrThrow({ where: { id: f.account.user.id } }),
      ).toMatchObject({ status: 'DELETED', email: null, displayName: '退会済みユーザー' });
      expect(await client.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
        requestedBy: null,
        status: 'LEASED',
      });
      expect(
        await client.improvementTriageCandidate.findUnique({ where: { id: expiredCandidate.id } }),
      ).not.toBeNull();
      expect((await f.repo().execute(job, 'retention-worker')).status).toBe('SUCCEEDED');
      expect(
        await client.improvementTriageCandidate.findUnique({ where: { id: expiredCandidate.id } }),
      ).toBeNull();
      await client.improvementTriageCandidate.create({
        data: {
          ...expiredCandidate,
          id: randomUUID(),
          clusterRef: 'c'.repeat(64),
        },
      });
      await f.repo().schedule('STAGING');
      expect(await client.job.count({ where: { workspaceId: f.workspaceId } })).toBe(2);
      await f.repo(() => new Date(now.getTime() + day)).schedule('STAGING');
      const next = await client.job.findFirstOrThrow({
        where: {
          workspaceId: f.workspaceId,
          status: 'PENDING',
        },
      });
      expect(next).toMatchObject({
        requestedBy: null,
        payloadReference: improvementFeedbackPurgePayload(f.group.id),
      });
      expect(next.id).not.toBe(job.id);
      expect(await f.remaining()).toBe(0);
    });

    it('safety regression: terminal history expires at 180 days; ordinary, active and other-environment Jobs remain', async () => {
      const account = await new CreateUserWithPersonalWorkspace(
        new PrismaAccountUnitOfWork(client),
      ).execute({ displayName: 'Synthetic FK only' });
      const group = await client.group.create({
        data: {
          workspaceId: account.workspace.id,
          name: 'Synthetic FK scope',
        },
      });
      const old = new Date(now.getTime() - 181 * day);
      const job = await client.job.create({
        data: {
          environment: 'DEVELOPMENT',
          workspaceId: account.workspace.id,
          requestedBy: null,
          jobType: 'IMPROVEMENT_FEEDBACK_PURGE',
          payloadReference: improvementFeedbackPurgePayload(group.id),
          idempotencyKey: `${improvementFeedbackPurgePayload(group.id)}:${old.toISOString().slice(0, 10)}`,
          correlationId: 'feedback-retention-v1',
          status: 'SUCCEEDED',
          completedAt: old,
          createdAt: old,
          scheduledAt: old,
        },
      });
      const create = (
        status: 'PENDING' | 'SUCCEEDED' | 'CANCELLED' | 'DEAD',
        age: number,
        environment: 'DEVELOPMENT' | 'STAGING' = 'DEVELOPMENT',
        serviceId = group.id,
      ) => {
        const at = new Date(now.getTime() - age);
        return client.job.create({
          data: {
            environment,
            workspaceId: account.workspace.id,
            requestedBy: null,
            jobType: 'IMPROVEMENT_FEEDBACK_PURGE',
            payloadReference: improvementFeedbackPurgePayload(serviceId),
            idempotencyKey: `${improvementFeedbackPurgePayload(serviceId)}:${at.toISOString().slice(0, 10)}`,
            correlationId: 'feedback-retention-v1',
            status,
            scheduledAt: at,
            completedAt: status === 'SUCCEEDED' ? at : null,
            cancelledAt: status === 'CANCELLED' ? at : null,
            maintenanceTerminalAt: status === 'PENDING' ? null : at,
          },
        });
      };
      const freshGroup = await client.group.create({
        data: { workspaceId: account.workspace.id, name: 'Synthetic fresh boundary' },
      });
      const boundary = await create('CANCELLED', 180 * day);
      const fresh = await create('SUCCEEDED', 180 * day - 1, 'DEVELOPMENT', freshGroup.id);
      const dead = await create('DEAD', 182 * day);
      const pending = await create('PENDING', 183 * day);
      const other = await create('SUCCEEDED', 184 * day, 'STAGING');
      const leased = await create('PENDING', 185 * day);
      await client.job.update({
        where: { id: leased.id },
        data: { status: 'LEASED', leaseOwner: 'synthetic', leaseExpiresAt: old },
      });
      const retry = await create('PENDING', 186 * day);
      await client.job.update({
        where: { id: retry.id },
        data: { status: 'RETRY_SCHEDULED', nextRetryAt: old },
      });
      const ordinary = await client.job.create({
        data: {
          environment: 'DEVELOPMENT',
          workspaceId: account.workspace.id,
          requestedBy: account.user.id,
          jobType: 'SYNTHETIC_USER_JOB',
          payloadReference: 'synthetic',
          idempotencyKey: randomUUID(),
          correlationId: 'synthetic',
          status: 'SUCCEEDED',
          completedAt: old,
          createdAt: old,
        },
      });
      await expect(
        client.job.update({
          where: { id: dead.id },
          data: { status: 'PENDING', maintenanceTerminalAt: null },
        }),
      ).rejects.toThrow();
      await expect(
        client.job.update({ where: { id: job.id }, data: { maintenanceTerminalAt: now } }),
      ).rejects.toThrow();
      await new PrismaImprovementFeedbackRetentionJobRepository(client, () => now).schedule(
        'DEVELOPMENT',
      );
      for (const expired of [job, boundary, dead])
        expect(await client.job.findUnique({ where: { id: expired.id } })).toBeNull();
      for (const retained of [fresh, pending, leased, retry, other, ordinary])
        expect(await client.job.findUnique({ where: { id: retained.id } })).not.toBeNull();
      await expect(client.user.delete({ where: { id: account.user.id } })).rejects.toMatchObject({
        code: 'P2003',
      });
      expect(await client.user.findUnique({ where: { id: account.user.id } })).not.toBeNull();
      // Fixture only: ordinary Job still owns its FK; maintenance does not.
      await client.job.delete({ where: { id: ordinary.id } });
      await expect(client.user.delete({ where: { id: account.user.id } })).resolves.toMatchObject({
        id: account.user.id,
      });
    });

    it('maintenance contract rejects null User actors, actorful purge and foreign Service; public repository cannot enqueue purge', async () => {
      const f = await fixture(0);
      const sibling = await fixture(0);
      const ordinary = {
        environment: 'STAGING' as const,
        workspaceId: f.workspaceId,
        requestedBy: f.account.user.id,
        jobType: 'SYNTHETIC_USER_JOB',
        payloadReference: 'synthetic',
        idempotencyKey: randomUUID(),
        correlationId: 'synthetic',
      };
      await expect(
        client.job.create({ data: { ...ordinary, requestedBy: null } }),
      ).rejects.toThrow();
      const maintenance = {
        ...ordinary,
        requestedBy: null,
        jobType: 'IMPROVEMENT_FEEDBACK_PURGE',
        correlationId: 'feedback-retention-v1',
        payloadReference: improvementFeedbackPurgePayload(f.group.id),
        idempotencyKey: `${improvementFeedbackPurgePayload(f.group.id)}:2026-10-03`,
        scheduledAt: now,
      };
      for (const changed of [
        { requestedBy: f.account.user.id },
        { bunshinId: f.bunshin.id },
        { capabilityType: 'SOCIAL' as const },
        { correlationId: 'other' },
        { idempotencyKey: 'invalid' },
        {
          payloadReference: improvementFeedbackPurgePayload(sibling.group.id),
          idempotencyKey: `${improvementFeedbackPurgePayload(sibling.group.id)}:2026-10-03`,
        },
      ])
        await expect(client.job.create({ data: { ...maintenance, ...changed } })).rejects.toThrow();
      await expect(
        new PrismaJobRepository(client).enqueue({ ...maintenance, requestedBy: f.account.user.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await client.job.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    });

    it('actual migration preflight and UPDATE detach only valid legacy purge; malformed legacy row rolls back', async () => {
      const f = await fixture(0);
      const sql = readFileSync(
        new URL(
          '../prisma/migrations/20261003050000_feedback_maintenance_job/migration.sql',
          import.meta.url,
        ),
        'utf8',
      );
      const preflight = sql.match(/DO \$\$ BEGIN[\s\S]*?END \$\$;/)![0];
      const update = sql.slice(
        sql.indexOf('UPDATE jobs SET requested_by'),
        sql.indexOf('ALTER TABLE jobs ADD CONSTRAINT'),
      );
      const rollback = new Error('synthetic rollback after assertions');
      const legacy = {
        workspaceId: f.workspaceId,
        requestedBy: f.account.user.id,
        environment: 'STAGING' as const,
        jobType: 'IMPROVEMENT_FEEDBACK_PURGE',
        payloadReference: improvementFeedbackPurgePayload(f.group.id),
        idempotencyKey: `${improvementFeedbackPurgePayload(f.group.id)}:2026-10-03`,
        correlationId: 'feedback-retention-v1',
        scheduledAt: now,
        status: 'DEAD' as const,
      };
      await expect(
        client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('ALTER TABLE jobs DROP CONSTRAINT jobs_actor_contract');
          await tx.$executeRawUnsafe('DROP TRIGGER jobs_feedback_maintenance_contract ON jobs');
          const migrationClock = await tx.$queryRaw<
            { now: Date }[]
          >`SELECT CURRENT_TIMESTAMP AS now`;
          const old = await tx.job.create({ data: legacy });
          const ordinary = await tx.job.create({
            data: { ...legacy, jobType: 'SYNTHETIC_USER_JOB', idempotencyKey: randomUUID() },
          });
          await tx.$executeRawUnsafe(preflight);
          await tx.$executeRawUnsafe(update);
          const migrated = await tx.job.findUniqueOrThrow({ where: { id: old.id } });
          expect(migrated.requestedBy).toBeNull();
          expect(migrated.maintenanceTerminalAt).not.toBeNull();
          expect(migrated.maintenanceTerminalAt).toEqual(migrationClock[0]!.now);
          expect((await tx.job.findUniqueOrThrow({ where: { id: ordinary.id } })).requestedBy).toBe(
            f.account.user.id,
          );
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      await expect(
        client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('ALTER TABLE jobs DROP CONSTRAINT jobs_actor_contract');
          await tx.$executeRawUnsafe('DROP TRIGGER jobs_feedback_maintenance_contract ON jobs');
          await tx.job.create({ data: { ...legacy, correlationId: 'unreviewed' } });
          await tx.$executeRawUnsafe(preflight);
        }),
      ).rejects.toThrow();
      // Transaction rollback restores constraints/triggers and keeps preexisting data.
      await expect(client.job.create({ data: legacy })).rejects.toThrow();
      expect(await client.job.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    });

    it('history cleanup is bounded to 100 and protects a real retry FK without erasing its evidence', async () => {
      const f = await fixture(0);
      const data = Array.from({ length: 102 }, (_, index) => {
        const at = new Date(now.getTime() - (200 + index) * day);
        return {
          environment: 'PRODUCTION' as const,
          workspaceId: f.workspaceId,
          requestedBy: null,
          jobType: 'IMPROVEMENT_FEEDBACK_PURGE',
          payloadReference: improvementFeedbackPurgePayload(f.group.id),
          idempotencyKey: `${improvementFeedbackPurgePayload(f.group.id)}:${at.toISOString().slice(0, 10)}`,
          correlationId: 'feedback-retention-v1',
          status: 'SUCCEEDED' as const,
          scheduledAt: at,
          completedAt: at,
        };
      });
      await client.job.createMany({ data });
      const protectedJob = await client.job.findFirstOrThrow({
        where: { workspaceId: f.workspaceId },
        orderBy: { scheduledAt: 'asc' },
      });
      const mission = await client.dailyMission.create({
        data: {
          workspaceId: f.workspaceId,
          bunshinId: f.bunshin.id,
          missionDate: now,
          format: 'TEXT',
          estimatedMinutes: 1,
          topic: 'Synthetic',
          angle: 'Synthetic',
          reason: 'Synthetic',
        },
      });
      const delivery = await client.lineMessageDelivery.create({
        data: {
          workspaceId: f.workspaceId,
          bunshinId: f.bunshin.id,
          userId: f.account.user.id,
          dailyMissionId: mission.id,
          environment: 'PRODUCTION',
          idempotencyKey: randomUUID(),
        },
      });
      const reference = await client.lineDeliveryRetryRequest.create({
        data: {
          id: randomUUID(),
          environment: 'PRODUCTION',
          deliveryId: delivery.id,
          deliveryAttemptCount: 1,
          actorUserId: f.account.user.id,
          reason: 'Synthetic FK guard only',
          jobId: protectedJob.id,
        },
      });
      await f.repo().schedule('PRODUCTION');
      expect(await client.job.count({ where: { workspaceId: f.workspaceId } })).toBe(2);
      expect(await client.job.findUnique({ where: { id: protectedJob.id } })).not.toBeNull();
      await f.repo().schedule('PRODUCTION');
      expect(await client.job.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
      expect(
        await client.lineDeliveryRetryRequest.findUnique({ where: { id: reference.id } }),
      ).not.toBeNull();
      // No LINE calls: remove synthetic dangling reference to exercise eventual cleanup.
      await client.lineDeliveryRetryRequest.delete({ where: { id: reference.id } });
      await f.repo().schedule('PRODUCTION');
      expect(await client.job.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    });
  });
}
