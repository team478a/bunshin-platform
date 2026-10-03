import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
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
      const leased = () =>
        client.job.create({
          data: {
            workspaceId,
            requestedBy: account.user.id,
            environment: 'STAGING',
            jobType: 'IMPROVEMENT_FEEDBACK_PURGE',
            payloadReference: improvementFeedbackPurgePayload(group.id),
            idempotencyKey: `${improvementFeedbackPurgePayload(group.id)}:2026-10-03`,
            correlationId: 'synthetic-retention',
            status: 'LEASED',
            leaseOwner: 'retention-worker',
            leaseExpiresAt: new Date(now.getTime() + 300_000),
            attemptCount: 1,
            priority: 0,
          },
        });
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
        requestedBy: f.account.user.id,
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

    it('retention Job: CANCELLED state refuses deletion and ownerless scope is explicitly not schedulable', async () => {
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
      await f.repo(() => new Date(now.getTime() + day)).schedule('STAGING');
      expect(await client.job.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
      expect(await f.remaining()).toBe(1);
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
  });
}
