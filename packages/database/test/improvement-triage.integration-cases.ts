import { randomUUID } from 'node:crypto';
import { it, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  CreateUserWithPersonalWorkspace,
  ReviewImprovementFeedbackCandidate,
  type ImprovementFeedbackTriageRepository,
  type ReviewImprovementFeedbackInput,
} from '@bunshin/application';
import {
  PrismaAccountUnitOfWork,
  PrismaAccountDeletionPurgeRepository,
  PrismaImprovementFeedbackTriageRepository,
  PrismaImprovementFeedbackObservationAdapter,
  purgeExpiredImprovementFeedback,
} from '../src';

const day = 86_400_000;
const now = new Date('2026-10-03T03:00:00Z');
const week = new Date('2026-09-20T15:00:00Z');
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
/** Existing integration-suite guard + CI PostgreSQL only. No external Provider/Storage calls. */
export function registerImprovementTriageIntegrationCases(client: PrismaClient) {
  describe('improvement triage isolated PostgreSQL contracts', () => {
    beforeEach(() =>
      vi.stubGlobal('fetch', () => {
        throw new Error('external Provider communication forbidden');
      }),
    );
    afterEach(() => vi.unstubAllGlobals());
    async function fixture() {
      const manager = await new CreateUserWithPersonalWorkspace(
        new PrismaAccountUnitOfWork(client),
      ).execute({ displayName: 'Synthetic triage manager' });
      const group = await client.group.create({
        data: { workspaceId: manager.workspace.id, name: 'Synthetic triage' },
      });
      await client.serviceConfiguration.create({
        data: {
          workspaceId: manager.workspace.id,
          groupId: group.id,
          slug: `triage-${randomUUID()}`,
          displayName: 'Synthetic',
          description: 'Synthetic',
          operatorName: 'Synthetic',
          createdByUserId: manager.user.id,
          updatedByUserId: manager.user.id,
        },
      });
      const membership = await client.groupMembership.create({
        data: {
          workspaceId: manager.workspace.id,
          groupId: group.id,
          userId: manager.user.id,
          status: 'ACTIVE',
          consentedAt: now,
          serviceRole: 'SERVICE_OWNER',
        },
      });
      const reporters = await Promise.all(
        Array.from({ length: 5 }, () =>
          client.user.create({ data: { displayName: 'Synthetic reporter' } }),
        ),
      );
      const bunshins = await Promise.all(
        reporters.map((user) =>
          client.bunshin.create({
            data: {
              workspaceId: manager.workspace.id,
              groupId: group.id,
              ownerUserId: user.id,
              name: 'Synthetic',
              slug: `triage-${randomUUID()}`,
              type: 'COPY',
              objectiveSummary: 'O',
              audienceSummary: 'A',
              personalitySummary: 'P',
            },
          }),
        ),
      );
      const sources = await Promise.all(
        reporters.map((user, i) =>
          client.improvementFeedback.create({
            data: {
              workspaceId: manager.workspace.id,
              serviceId: group.id,
              bunshinId: bunshins[i]!.id,
              actorUserId: user.id,
              submissionKey: randomUUID(),
              packageKey: 'SOCIAL',
              category: 'OPERATION',
              surface: 'TODAY',
              impact: 'BLOCKED',
              createdAt: new Date('2026-09-22T03:00:00Z'),
            },
          }),
        ),
      );
      const scope = {
        tenantRef: manager.workspace.id,
        workspaceId: manager.workspace.id,
        serviceId: group.id,
        packageKey: 'SOCIAL',
        adapterKey: 'TROUBLE_FEEDBACK',
        environment: 'DEVELOPMENT' as const,
      };
      const read = {
        scope,
        actorUserId: manager.user.id,
        subject: null,
        limit: 1000,
        fromInclusive: week,
        toExclusive: new Date(week.getTime() + 7 * day),
      };
      const repo = new PrismaImprovementFeedbackTriageRepository(client, scope, () => now);
      const evidence = await new PrismaImprovementFeedbackObservationAdapter(
        client,
        scope,
        () => now,
      ).reviewEvidence(read);
      const candidate = await repo.createCandidate({
        actorUserId: manager.user.id,
        weekStart: week,
        clusterRef: evidence.buckets[0]!.clusterRef,
      });
      const input: ReviewImprovementFeedbackInput = {
        scope,
        actorUserId: manager.user.id,
        candidateId: candidate.id,
        operationKey: randomUUID(),
        expectedCandidateRevision: 1,
        expectedWindowEvidenceRevision: candidate.windowEvidenceRevision!,
        expectedBucketEvidenceRevision: candidate.bucketEvidenceRevision!,
        action: 'MARK_REVIEWED',
        reasonCode: 'REVIEW_COMPLETED',
      };
      const review = (value = input, repository: ImprovementFeedbackTriageRepository = repo) =>
        new ReviewImprovementFeedbackCandidate(repository, () => now).execute(value);
      return {
        manager,
        group,
        membership,
        reporters,
        bunshins,
        sources,
        scope,
        read,
        repo,
        candidate,
        input,
        review,
      };
    }
    async function blocked(label: string) {
      // Condition polling, not sleep/timing: fail if actual DB blocking is not observed.
      for (let attempt = 0; attempt < 100; attempt++) {
        const rows = await client.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE application_name = ${label} AND cardinality(pg_blocking_pids(pid)) > 0
      ) AS blocked`;
        if (rows[0]?.blocked) return;
      }
      throw new Error('expected PostgreSQL lock barrier not reached');
    }
    it('triage persistence: normal review + fresh-instance lost-response replay is one CAS and one audit', async () => {
      const f = await fixture();
      const receipt = await f.review();
      expect(receipt).toEqual({
        candidateId: f.candidate.id,
        candidateRevision: 2,
        state: 'REVIEWED',
      });
      expect(
        await f.review(
          f.input,
          new PrismaImprovementFeedbackTriageRepository(client, f.scope, () => now),
        ),
      ).toEqual(receipt);
      const audit = await client.improvementTriageOperation.findFirstOrThrow({
        where: { candidateId: f.candidate.id },
      });
      expect(
        await client.improvementTriageOperation.count({ where: { candidateId: f.candidate.id } }),
      ).toBe(1);
      expect(audit.expiresAt.getTime() - audit.occurredAt.getTime()).toBe(180 * day);
      for (const forbidden of ['sourceRefs', 'evidenceRevision', 'reports', 'email', 'feedbackId'])
        expect(Object.keys(audit)).not.toContain(forbidden);
      expect(
        await f.repo.createCandidate({
          actorUserId: f.manager.user.id,
          weekStart: week,
          clusterRef: f.candidate.clusterRef,
        }),
      ).toMatchObject({ id: f.candidate.id, state: 'REVIEWED', expiresAt: f.candidate.expiresAt });
      await expect(
        f.review({ ...f.input, action: 'DISMISS', reasonCode: 'OUT_OF_SCOPE' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
    it('triage persistence: concurrent CAS operations have exactly one winner in PostgreSQL', async () => {
      const f = await fixture();
      const results = await Promise.allSettled([
        f.review(),
        f.review({ ...f.input, operationKey: randomUUID() }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(
        await client.improvementTriageOperation.count({ where: { candidateId: f.candidate.id } }),
      ).toBe(1);
      expect(
        (
          await client.improvementTriageCandidate.findUniqueOrThrow({
            where: { id: f.candidate.id },
          })
        ).candidateRevision,
      ).toBe(2);
    });
    it('triage persistence: raw source deletion erases both hashes and rejects old review/replay', async () => {
      const f = await fixture();
      await f.review();
      await client.improvementFeedback.delete({ where: { id: f.sources[0]!.id } });
      expect(
        await client.improvementTriageCandidate.findUniqueOrThrow({
          where: { id: f.candidate.id },
        }),
      ).toMatchObject({
        state: 'STALE',
        candidateRevision: 3,
        windowEvidenceRevision: null,
        bucketEvidenceRevision: null,
      });
      await expect(f.review()).rejects.toMatchObject({ code: 'CONFLICT' });
      const audit = await client.improvementTriageOperation.findFirstOrThrow({
        where: { candidateId: f.candidate.id },
      });
      expect(JSON.stringify(audit)).not.toContain(f.sources[0]!.id);
      expect(JSON.stringify(audit)).not.toContain(f.input.expectedWindowEvidenceRevision);
    });
    it('triage persistence: source INSERT/UPDATE + Bunshin ownership move invalidate the full window', async () => {
      for (const mutation of ['INSERT', 'UPDATE', 'OWNER'] as const) {
        const f = await fixture();
        if (mutation === 'INSERT')
          await client.improvementFeedback.create({
            data: { ...f.sources[0]!, id: randomUUID(), submissionKey: randomUUID() },
          });
        if (mutation === 'UPDATE')
          await client.improvementFeedback.update({
            where: { id: f.sources[0]!.id },
            data: { impact: 'SUGGESTION' },
          });
        if (mutation === 'OWNER')
          await client.bunshin.update({
            where: { id: f.bunshins[0]!.id },
            data: { ownerUserId: f.reporters[1]!.id },
          });
        expect(
          await client.improvementTriageCandidate.findUniqueOrThrow({
            where: { id: f.candidate.id },
          }),
        ).toMatchObject({
          state: 'STALE',
          windowEvidenceRevision: null,
          bucketEvidenceRevision: null,
        });
        await expect(f.review()).rejects.toMatchObject({ code: 'CONFLICT' });
      }
    });
    it('triage persistence: physical Bunshin deletion/cascade invalidates without a source-link copy', async () => {
      const f = await fixture();
      await client.bunshin.delete({ where: { id: f.bunshins[0]!.id } });
      expect(await client.improvementFeedback.count({ where: { id: f.sources[0]!.id } })).toBe(0);
      expect(
        await client.improvementTriageCandidate.findUniqueOrThrow({
          where: { id: f.candidate.id },
        }),
      ).toMatchObject({
        state: 'STALE',
        windowEvidenceRevision: null,
        bucketEvidenceRevision: null,
      });
    });
    it('triage persistence: service/workspace deletion cascades candidates and audit, not sibling service', async () => {
      const f = await fixture();
      const sibling = await fixture();
      await f.review();
      await client.bunshin.deleteMany({ where: { groupId: f.group.id } });
      await client.group.delete({ where: { id: f.group.id } });
      expect(await client.improvementTriageCandidate.count({ where: { id: f.candidate.id } })).toBe(
        0,
      );
      expect(
        await client.improvementTriageOperation.count({ where: { serviceId: f.group.id } }),
      ).toBe(0);
      expect(await client.improvementFeedback.count({ where: { serviceId: f.group.id } })).toBe(0);
      expect(
        await client.improvementTriageCandidate.count({ where: { id: sibling.candidate.id } }),
      ).toBe(1);
    });
    it('triage persistence: all six scope fields and revoked roles are denied even on replay', async () => {
      const f = await fixture();
      await f.review();
      for (const field of [
        'tenantRef',
        'workspaceId',
        'serviceId',
        'environment',
        'packageKey',
        'adapterKey',
      ] as const) {
        const changed = {
          ...f.scope,
          [field]:
            field === 'environment' ? 'STAGING' : field.endsWith('Id') ? randomUUID() : 'OTHER',
        };
        await expect(
          f.repo.transaction({ scope: changed, actorUserId: f.manager.user.id }, () =>
            Promise.resolve(null),
          ),
        ).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
      }
      for (const role of ['CONTENT_EDITOR', 'PARTICIPANT'] as const) {
        await client.groupMembership.update({
          where: { id: f.membership.id },
          data: { serviceRole: role },
        });
        await expect(f.review()).rejects.toMatchObject({ code: 'NOT_FOUND' });
      }
      await client.groupMembership.update({
        where: { id: f.membership.id },
        data: { serviceRole: 'SERVICE_ADMIN', status: 'REVOKED', revokedAt: now },
      });
      await expect(f.review()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('triage persistence: source delete waits on review transaction; later commit always invalidates', async () => {
      const f = await fixture();
      const readReached = gate();
      const release = gate();
      const deleteStarted = gate();
      const label = `triage-delete-${randomUUID()}`;
      const wrapped: ImprovementFeedbackTriageRepository = {
        transaction: (context, work) =>
          f.repo.transaction(context, (tx) =>
            work({
              ...tx,
              evidence: async (input) => {
                const result = await tx.evidence(input);
                readReached.resolve();
                await release.promise;
                return result;
              },
            }),
          ),
      };
      const reviewing = f.review(f.input, wrapped);
      await readReached.promise;
      const deleting = client.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT set_config('application_name', ${label}, true)`;
          deleteStarted.resolve();
          await tx.improvementFeedback.delete({ where: { id: f.sources[0]!.id } });
        },
        { timeout: 20_000 },
      );
      const completed = Promise.allSettled([reviewing, deleting]);
      try {
        await deleteStarted.promise;
        await blocked(label);
      } finally {
        release.resolve();
        await completed;
      }
      await reviewing;
      await deleting;
      expect(
        await client.improvementTriageCandidate.findUniqueOrThrow({
          where: { id: f.candidate.id },
        }),
      ).toMatchObject({ state: 'STALE', windowEvidenceRevision: null });
      await expect(f.review()).rejects.toMatchObject({ code: 'CONFLICT' });
    }, 30_000);
    it('triage persistence: delete commits before review acquisition and no stale audit is written', async () => {
      const f = await fixture();
      const deleted = gate();
      const release = gate();
      const deleting = client.$transaction(
        async (tx) => {
          await tx.improvementFeedback.delete({ where: { id: f.sources[0]!.id } });
          deleted.resolve();
          await release.promise;
        },
        { timeout: 20_000 },
      );
      await deleted.promise;
      const label = `triage-review-${randomUUID()}`;
      const tagged = new Proxy(client, {
        get(target, property) {
          if (property === '$transaction')
            return (
              work: (
                tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
              ) => Promise<unknown>,
              options: object,
            ) =>
              target.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT set_config('application_name', ${label}, true)`;
                return work(tx);
              }, options);
          const value: unknown = Reflect.get(target, property);
          return value;
        },
      });
      const reviewing = f.review(
        f.input,
        new PrismaImprovementFeedbackTriageRepository(tagged, f.scope, () => now),
      );
      const rejected = expect(reviewing).rejects.toMatchObject({ code: 'CONFLICT' });
      const completed = Promise.allSettled([deleting, rejected]);
      try {
        await blocked(label);
      } finally {
        release.resolve();
        await completed;
      }
      await deleting;
      await rejected;
      expect(
        await client.improvementTriageOperation.count({ where: { candidateId: f.candidate.id } }),
      ).toBe(0);
    }, 30_000);
    it('triage persistence: membership revocation waits for authorized review, then denies replay', async () => {
      const f = await fixture();
      const reached = gate();
      const release = gate();
      const started = gate();
      const wrapped: ImprovementFeedbackTriageRepository = {
        transaction: (context, work) =>
          f.repo.transaction(context, (tx) =>
            work({
              ...tx,
              evidence: async (input) => {
                const result = await tx.evidence(input);
                reached.resolve();
                await release.promise;
                return result;
              },
            }),
          ),
      };
      const reviewing = f.review(f.input, wrapped);
      await reached.promise;
      const label = `triage-revoke-${randomUUID()}`;
      const revoking = client.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT set_config('application_name', ${label}, true)`;
          started.resolve();
          await tx.groupMembership.update({
            where: { id: f.membership.id },
            data: { status: 'REVOKED', revokedAt: now },
          });
        },
        { timeout: 20_000 },
      );
      const completed = Promise.allSettled([reviewing, revoking]);
      try {
        await started.promise;
        await blocked(label);
      } finally {
        release.resolve();
        await completed;
      }
      await reviewing;
      await revoking;
      await expect(f.review()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }, 30_000);
    it('triage persistence: audit INSERT database fault rolls back CAS; clean retry is one operation', async () => {
      const f = await fixture();
      const key = '00000000-0000-4000-8000-000000000091';
      await client.$executeRawUnsafe(
        `CREATE FUNCTION test_triage_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`,
      );
      await client.$executeRawUnsafe(
        `CREATE TRIGGER test_triage_audit_fault BEFORE INSERT ON improvement_triage_operations FOR EACH ROW WHEN (NEW.operation_key = '${key}'::uuid) EXECUTE FUNCTION test_triage_audit_fault()`,
      );
      try {
        await expect(f.review({ ...f.input, operationKey: key })).rejects.toThrow(
          'synthetic audit failure',
        );
        expect(
          await client.improvementTriageCandidate.findUniqueOrThrow({
            where: { id: f.candidate.id },
          }),
        ).toMatchObject({ candidateRevision: 1, state: 'OPEN' });
        expect(
          await client.improvementTriageOperation.count({ where: { candidateId: f.candidate.id } }),
        ).toBe(0);
      } finally {
        await client.$executeRawUnsafe(
          'DROP TRIGGER test_triage_audit_fault ON improvement_triage_operations',
        );
        await client.$executeRawUnsafe('DROP FUNCTION test_triage_audit_fault()');
      }
      expect(await f.review({ ...f.input, operationKey: key })).toMatchObject({
        candidateRevision: 2,
      });
    });
    it('triage persistence: completed deletion removes only own feedback and audit actor; organization manual review is retained', async () => {
      const f = await fixture();
      await f.review();
      // This manager also authored a historical signal. DB insertion invalidates the old candidate.
      const own = await client.bunshin.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.group.id,
          ownerUserId: f.manager.user.id,
          name: 'Synthetic own',
          slug: randomUUID(),
          type: 'COPY',
          objectiveSummary: 'O',
          audienceSummary: 'A',
          personalitySummary: 'P',
        },
      });
      await client.improvementFeedback.create({
        data: {
          ...f.sources[0]!,
          id: randomUUID(),
          submissionKey: randomUUID(),
          actorUserId: f.manager.user.id,
          bunshinId: own.id,
        },
      });
      await client.user.update({ where: { id: f.manager.user.id }, data: { status: 'SUSPENDED' } });
      const request = await client.accountDeletionRequest.create({
        data: {
          userId: f.manager.user.id,
          status: 'PROCESSING',
          scheduledFor: now,
          leaseOwner: 'synthetic-worker',
          leaseExpiresAt: new Date(now.getTime() + day),
        },
      });
      const organization = await client.workspace.create({
        data: { type: 'ORGANIZATION', name: 'Synthetic organization' },
      });
      const orgBunshin = await client.bunshin.create({
        data: {
          workspaceId: organization.id,
          ownerUserId: f.manager.user.id,
          name: 'Preserved organization',
          slug: randomUUID(),
          type: 'COPY',
          objectiveSummary: 'O',
          audienceSummary: 'A',
          personalitySummary: 'P',
        },
      });
      const repo = new PrismaAccountDeletionPurgeRepository(client);
      const deletionInput = {
        requestId: request.id,
        userId: f.manager.user.id,
        workerId: 'synthetic-worker',
        now,
      };
      expect(await repo.completeAfterAuthDeletion(deletionInput)).toMatchObject({
        status: 'BLOCKED',
        blockedReason: 'MANUAL_REVIEW_REQUIRED',
      });
      expect(
        await client.improvementFeedback.count({ where: { actorUserId: f.manager.user.id } }),
      ).toBe(1);
      await client.bunshin.delete({ where: { id: orgBunshin.id } });
      await client.accountDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'PROCESSING',
          blockedReason: null,
          leaseOwner: 'synthetic-worker',
          leaseExpiresAt: new Date(now.getTime() + day),
        },
      });
      expect(await repo.completeAfterAuthDeletion(deletionInput)).toMatchObject({
        status: 'COMPLETED',
      });
      expect(
        await client.improvementFeedback.count({ where: { actorUserId: f.manager.user.id } }),
      ).toBe(0);
      expect(await client.improvementFeedback.count({ where: { serviceId: f.group.id } })).toBe(5);
      expect(
        await client.improvementTriageOperation.findFirstOrThrow({
          where: { candidateId: f.candidate.id },
        }),
      ).toMatchObject({ actorUserId: null });
      expect(
        await client.improvementTriageCandidate.findUniqueOrThrow({
          where: { id: f.candidate.id },
        }),
      ).toMatchObject({
        state: 'STALE',
        windowEvidenceRevision: null,
        bucketEvidenceRevision: null,
      });
      expect(await repo.completeAfterAuthDeletion(deletionInput)).toBeNull();
    });
    it('triage persistence: soft-deleted user trigger erases reporter feedback without touching another reporter', async () => {
      const f = await fixture();
      await client.user.update({ where: { id: f.reporters[0]!.id }, data: { status: 'DELETED' } });
      expect(await client.improvementFeedback.count({ where: { id: f.sources[0]!.id } })).toBe(0);
      expect(await client.improvementFeedback.count({ where: { serviceId: f.group.id } })).toBe(4);
      expect(
        await client.improvementTriageCandidate.findUniqueOrThrow({
          where: { id: f.candidate.id },
        }),
      ).toMatchObject({ state: 'STALE', windowEvidenceRevision: null });
      await expect(
        client.improvementFeedback.create({
          data: { ...f.sources[0]!, id: randomUUID(), submissionKey: randomUUID() },
        }),
      ).rejects.toThrow('inactive feedback source owner');
      expect(
        await client.improvementFeedback.count({ where: { actorUserId: f.reporters[0]!.id } }),
      ).toBe(0);
    });
    it('triage persistence: source INSERT locks the active owner; later deletion erases it rather than resurrecting it', async () => {
      const f = await fixture();
      const inserted = gate();
      const release = gate();
      const started = gate();
      const newId = randomUUID();
      const inserting = client.$transaction(
        async (tx) => {
          await tx.improvementFeedback.create({
            data: { ...f.sources[0]!, id: newId, submissionKey: randomUUID() },
          });
          inserted.resolve();
          await release.promise;
        },
        { timeout: 20_000 },
      );
      await inserted.promise;
      const label = `triage-owner-delete-${randomUUID()}`;
      const deleting = client.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT set_config('application_name', ${label}, true)`;
          started.resolve();
          await tx.user.update({ where: { id: f.reporters[0]!.id }, data: { status: 'DELETED' } });
        },
        { timeout: 20_000 },
      );
      const completed = Promise.allSettled([inserting, deleting]);
      try {
        await started.promise;
        await blocked(label);
      } finally {
        release.resolve();
        await completed;
      }
      await inserting;
      await deleting;
      expect(
        await client.improvementFeedback.count({ where: { actorUserId: f.reporters[0]!.id } }),
      ).toBe(0);
      expect(await client.improvementFeedback.count({ where: { id: newId } })).toBe(0);
      expect(await client.improvementFeedback.count({ where: { serviceId: f.group.id } })).toBe(4);
    }, 30_000);
    it('triage persistence: expiry rejects before purge; bounded batches restart without extending retention', async () => {
      const f = await fixture();
      await f.review();
      const old = new Date(now.getTime() - 90 * day);
      await client.improvementFeedback.update({
        where: { id: f.sources[0]!.id },
        data: { createdAt: old },
      });
      const evidence = await new PrismaImprovementFeedbackObservationAdapter(
        client,
        f.scope,
        () => now,
      ).reviewEvidence({ ...f.read, fromInclusive: new Date(old.getTime() - day) });
      expect(
        evidence.buckets.flatMap((b) => b.sourceRefs).some((r) => r.id === f.sources[0]!.id),
      ).toBe(false);
      const future = new Date(f.candidate.expiresAt);
      await expect(
        new ReviewImprovementFeedbackCandidate(
          new PrismaImprovementFeedbackTriageRepository(client, f.scope, () => future),
          () => future,
        ).execute(f.input),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      const first = await purgeExpiredImprovementFeedback(client, {
        ...f.scope,
        now: future,
        limit: 1,
      });
      expect(first).toMatchObject({
        sourcesDeleted: 1,
        candidatesDeleted: 1,
        auditsDeleted: 0,
        possiblyMore: true,
      });
      const detached = await client.improvementTriageOperation.findFirstOrThrow({
        where: { operationKey: f.input.operationKey },
      });
      expect(detached.candidateId).toBeNull();
      expect(detached.expiresAt.getTime()).toBe(now.getTime() + 180 * day);
      let remaining = first;
      for (let batch = 0; batch < 10 && remaining.possiblyMore; batch++)
        remaining = await purgeExpiredImprovementFeedback(client, {
          ...f.scope,
          now: future,
          limit: 1,
        });
      expect(remaining.possiblyMore).toBe(false);
      expect(await client.improvementFeedback.count({ where: { serviceId: f.group.id } })).toBe(0);
      expect(
        await purgeExpiredImprovementFeedback(client, { ...f.scope, now: detached.expiresAt }),
      ).toMatchObject({ auditsDeleted: 1 });
      expect(
        await purgeExpiredImprovementFeedback(client, { ...f.scope, now: detached.expiresAt }),
      ).toMatchObject({ auditsDeleted: 0 });
    });
    it('triage persistence: failed purge rolls back source/candidate/audit and a fresh batch resumes', async () => {
      const f = await fixture();
      await f.review();
      const later = new Date(now.getTime() + 181 * day);
      await client.$executeRawUnsafe(
        `CREATE FUNCTION test_triage_purge_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic purge failure'; END $$`,
      );
      await client.$executeRawUnsafe(
        'CREATE TRIGGER test_triage_purge_fault BEFORE DELETE ON improvement_triage_operations FOR EACH ROW EXECUTE FUNCTION test_triage_purge_fault()',
      );
      try {
        await expect(
          purgeExpiredImprovementFeedback(client, { ...f.scope, now: later }),
        ).rejects.toThrow();
        expect(await client.improvementFeedback.count({ where: { serviceId: f.group.id } })).toBe(
          5,
        );
        expect(
          await client.improvementTriageCandidate.findUniqueOrThrow({
            where: { id: f.candidate.id },
          }),
        ).toMatchObject({
          state: 'REVIEWED',
          candidateRevision: 2,
          windowEvidenceRevision: f.input.expectedWindowEvidenceRevision,
        });
        expect(
          await client.improvementTriageOperation.findFirstOrThrow({
            where: { operationKey: f.input.operationKey },
          }),
        ).toMatchObject({ candidateId: f.candidate.id });
      } finally {
        await client.$executeRawUnsafe(
          'DROP TRIGGER test_triage_purge_fault ON improvement_triage_operations',
        );
        await client.$executeRawUnsafe('DROP FUNCTION test_triage_purge_fault()');
      }
      expect(
        await purgeExpiredImprovementFeedback(client, { ...f.scope, now: later }),
      ).toMatchObject({
        sourcesDeleted: 5,
        candidatesDeleted: 1,
        auditsDeleted: 1,
        possiblyMore: false,
      });
    });
    it('triage persistence: current week, small other bucket and partial evidence cannot create a new candidate', async () => {
      const f = await fixture();
      await expect(
        f.repo.createCandidate({
          actorUserId: f.manager.user.id,
          weekStart: new Date('2026-09-27T15:00:00Z'),
          clusterRef: f.candidate.clusterRef,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await client.improvementFeedback.create({
        data: { ...f.sources[0]!, id: randomUUID(), submissionKey: randomUUID(), surface: 'OTHER' },
      });
      await expect(
        f.repo.createCandidate({
          actorUserId: f.manager.user.id,
          weekStart: week,
          clusterRef: f.candidate.clusterRef,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await client.improvementFeedback.createMany({
        data: Array.from({ length: 1000 }, () => ({
          ...f.sources[0]!,
          id: randomUUID(),
          submissionKey: randomUUID(),
        })),
      });
      await expect(
        f.repo.createCandidate({
          actorUserId: f.manager.user.id,
          weekStart: week,
          clusterRef: f.candidate.clusterRef,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(
        await client.improvementTriageCandidate.count({ where: { serviceId: f.group.id } }),
      ).toBe(1);
      expect(
        await client.improvementTriageOperation.count({ where: { serviceId: f.group.id } }),
      ).toBe(0);
    });
    it('triage persistence: public non-owner DB role cannot select or insert candidates/audit', async () => {
      const f = await fixture();
      await f.review();
      await client.$executeRawUnsafe('CREATE ROLE test_triage_public NOLOGIN');
      await client.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO test_triage_public');
      await client.$executeRawUnsafe(
        'GRANT SELECT, INSERT ON improvement_triage_candidates, improvement_triage_operations TO test_triage_public',
      );
      try {
        const visible = await client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE test_triage_public');
          return tx.$queryRaw<{ candidates: bigint; audits: bigint }[]>`SELECT
            (SELECT count(*) FROM improvement_triage_candidates WHERE id = ${f.candidate.id}::uuid) AS candidates,
            (SELECT count(*) FROM improvement_triage_operations WHERE candidate_id = ${f.candidate.id}::uuid) AS audits`;
        });
        expect(visible).toEqual([{ candidates: 0n, audits: 0n }]);
        const row = await client.improvementTriageCandidate.findUniqueOrThrow({
          where: { id: f.candidate.id },
        });
        await expect(
          client.$transaction(async (tx) => {
            await tx.$executeRawUnsafe('SET LOCAL ROLE test_triage_public');
            return tx.improvementTriageCandidate.create({ data: { ...row, id: randomUUID() } });
          }),
        ).rejects.toThrow('row-level security');
        const audit = await client.improvementTriageOperation.findFirstOrThrow({
          where: { candidateId: f.candidate.id },
        });
        await expect(
          client.$transaction(async (tx) => {
            await tx.$executeRawUnsafe('SET LOCAL ROLE test_triage_public');
            return tx.improvementTriageOperation.create({
              // Detached audit is a valid shape after candidate purge; it reaches the RLS check.
              data: { ...audit, id: randomUUID(), candidateId: null, operationKey: randomUUID() },
            });
          }),
        ).rejects.toThrow('row-level security');
      } finally {
        await client.$executeRawUnsafe(
          'REVOKE ALL ON improvement_triage_candidates, improvement_triage_operations FROM test_triage_public',
        );
        await client.$executeRawUnsafe('REVOKE USAGE ON SCHEMA public FROM test_triage_public');
        await client.$executeRawUnsafe('DROP ROLE test_triage_public');
      }
    });
    it('triage persistence: candidate and audit CHECK/scope constraints reject invalid direct writes', async () => {
      const f = await fixture();
      await f.review();
      await expect(
        client.improvementTriageCandidate.update({
          where: { id: f.candidate.id },
          data: { state: 'APPROVED' },
        }),
      ).rejects.toThrow();
      await expect(
        client.improvementTriageCandidate.update({
          where: { id: f.candidate.id },
          data: { expiresAt: new Date(f.candidate.expiresAt.getTime() + day) },
        }),
      ).rejects.toThrow();
      const audit = await client.improvementTriageOperation.findFirstOrThrow({
        where: { candidateId: f.candidate.id },
      });
      await expect(
        client.improvementTriageOperation.create({
          data: {
            ...audit,
            id: randomUUID(),
            operationKey: randomUUID(),
            tenantRef: 'other-tenant',
          },
        }),
      ).rejects.toThrow('invalid triage operation scope');
      expect(
        await client.improvementTriageOperation.count({ where: { candidateId: f.candidate.id } }),
      ).toBe(1);
    });
  });
}
