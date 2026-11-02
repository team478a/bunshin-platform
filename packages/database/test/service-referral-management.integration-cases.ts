import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaServiceReferralManagementRepository } from '../src/service-referral-management';
import { PrismaServiceReferralRewardRepository } from '../src/service-referral-reward-repository';
import { PrismaServiceReferralRewardRuleRepository } from '../src/service-referral-reward-rule-repository';
import { readConfirmedReferralCount } from '../src/service-referral-count';
const at = new Date('2026-11-01T00:00:00Z');
const now = new Date('2026-11-03T00:00:00Z');
export function registerReferralManagementIntegrationCases(client: PrismaClient) {
  describe('referral management vertical workflow PostgreSQL', () => {
    const workspaceIds: string[] = [];
    const userIds: string[] = [];
    afterEach(async () => {
      const where = { workspaceId: { in: workspaceIds } };
      await client.serviceReferralReward.deleteMany({ where });
      await client.serviceCreditLedger.deleteMany({ where });
      await client.serviceCreditAccount.deleteMany({ where });
      await client.serviceReferralQualificationAudit.deleteMany({ where });
      await client.serviceReferral.deleteMany({ where });
      await client.serviceReferralQualificationPolicyVersion.deleteMany({ where });
      await client.serviceReferralRewardRule.deleteMany({ where });
      await client.serviceReferralCode.deleteMany({ where });
      await client.bunshin.deleteMany({ where });
      await client.platformAdmin.deleteMany({ where: { userId: { in: userIds } } });
      await client.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await client.user.deleteMany({ where: { id: { in: userIds } } });
      workspaceIds.length = 0;
      userIds.length = 0;
    });
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    const conditions = {
      requireNewRegistration: true,
      requireOnboarding: false,
      requireFirstUserGeneration: false,
      minimumActiveDays: 0,
    };
    const policy = (
      f: Fixture,
      expectedPolicyVersionId: string | null = null,
      status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
    ) =>
      f.repo.savePolicy(f.scope, {
        expectedPolicyVersionId,
        authority: 'HEADQUARTERS',
        status,
        timezone: 'Asia/Tokyo',
        conditions,
        reason: 'Synthetic HQ approval',
      });
    const review = (f: Fixture) =>
      f.repo.execute(f.scope, {
        kind: 'REVIEW',
        commandId: randomUUID(),
        referralId: f.referral.id,
        expectedRevision: 0,
        review: 'CLEAR',
        reason: 'Synthetic review',
      });
    const confirm = (f: Fixture, id: string, commandId = randomUUID()) =>
      f.repo.execute(f.scope, {
        kind: 'CONFIRM',
        commandId,
        referralId: f.referral.id,
        expectedRevision: 1,
        expectedPolicyVersionId: id,
        reason: 'Synthetic confirmation',
      });
    const count = (f: Fixture) =>
      client.$transaction((tx) =>
        readConfirmedReferralCount(
          tx,
          {
            workspaceId: f.workspace.id,
            serviceId: f.group.id,
            groupMembershipId: f.introducing.id,
            userId: f.referrer.id,
          },
          now,
        ),
      );
    it('legacy records stay unassessed; no configured policy means unknown count', async () => {
      const f = await fixture();
      expect((await f.repo.overview(f.scope)).referrals[0]).toMatchObject({
        state: 'UNASSESSED',
        review: 'UNKNOWN',
        revision: 0,
      });
      expect(await count(f)).toBeNull();
      await expect(confirm(f, randomUUID())).rejects.toMatchObject({ code: 'CONFLICT' });
    });
    it('confirms from real evidence once under concurrent commands, exposes only own aggregate', async () => {
      const f = await fixture();
      const p = await policy(f);
      await review(f);
      const outcomes = await Promise.allSettled([confirm(f, p.id), confirm(f, p.id)]);
      expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(await count(f)).toBe(1);
      expect(
        await client.serviceReferralQualificationAudit.count({
          where: { referralId: f.referral.id },
        }),
      ).toBe(2);
      const audit = await client.serviceReferralQualificationAudit.findFirstOrThrow({
        where: { referralId: f.referral.id, kind: 'REVIEW' },
      });
      expect(audit.result).toMatchObject({
        before: { state: 'UNASSESSED', review: 'UNKNOWN', revision: 0 },
        after: { state: 'UNASSESSED', review: 'CLEAR', revision: 1 },
      });
      expect(
        await client.$transaction((tx) => readConfirmedReferralCount(tx, f.request.scope, now)),
      ).toBe(0);
    });
    it('replays exact command after cancellation without restoring count or credits; rejects payload collision', async () => {
      const f = await fixture();
      const p = await policy(f);
      await review(f);
      const commandId = randomUUID();
      const [saved, replayed] = await Promise.all([
        confirm(f, p.id, commandId),
        confirm(f, p.id, commandId),
      ]);
      expect(replayed).toEqual(saved);
      await f.repo.execute(f.scope, {
        kind: 'REVOKE',
        commandId: randomUUID(),
        referralId: f.referral.id,
        expectedRevision: 2,
        reason: 'Synthetic cancellation',
      });
      expect(await count(f)).toBe(0);
      expect(await confirm(f, p.id, commandId)).toEqual(saved);
      expect(await count(f)).toBe(0);
      await expect(
        f.repo.execute(f.scope, {
          kind: 'CONFIRM',
          commandId,
          referralId: f.referral.id,
          expectedRevision: 1,
          expectedPolicyVersionId: p.id,
          reason: 'Different request',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        f.repo.execute(f.scope, {
          kind: 'CONFIRM',
          commandId: randomUUID(),
          referralId: f.referral.id,
          expectedRevision: 3,
          expectedPolicyVersionId: p.id,
          reason: 'Resurrection',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
    it('rejects unknown review, missing evidence, stopped and stale policy', async () => {
      const f = await fixture();
      const p = await policy(f);
      await expect(
        f.repo.execute(f.scope, {
          kind: 'CONFIRM',
          commandId: randomUUID(),
          referralId: f.referral.id,
          expectedRevision: 0,
          expectedPolicyVersionId: p.id,
          reason: 'Not reviewed',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await review(f);
      await client.groupMembershipAuditLog.delete({ where: { id: f.audit.id } });
      await expect(confirm(f, p.id)).rejects.toMatchObject({ code: 'CONFLICT' });
      const stopped = await policy(f, p.id, 'SUSPENDED');
      await expect(confirm(f, p.id)).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(confirm(f, stopped.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    });
    it('serializes policy versions and rejects stale saves without changing confirmed proof', async () => {
      const f = await fixture();
      const p = await policy(f);
      await review(f);
      await confirm(f, p.id);
      const results = await Promise.allSettled([policy(f, p.id), policy(f, p.id)]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect((await f.repo.overview(f.scope)).referrals[0]?.confirmedPolicyVersionId).toBe(p.id);
      await expect(
        client.serviceReferralQualificationPolicyVersion.update({
          where: { id: p.id },
          data: { status: 'SUSPENDED' },
        }),
      ).rejects.toThrow();
      await expect(
        client.serviceReferral.update({ where: { id: f.referral.id }, data: { confirmedAt: now } }),
      ).resolves.toBeDefined();
      await expect(
        client.serviceReferral.update({
          where: { id: f.referral.id },
          data: { confirmedAt: new Date(now.getTime() + 1) },
        }),
      ).rejects.toThrow();
    });
    it('blocks participants, another OEM and inactive administrators', async () => {
      const f = await fixture();
      const other = await fixture();
      const p = await policy(f);
      await review(f);
      await expect(f.repo.overview({ ...f.scope, actorUserId: f.owner.id })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await client.platformAdmin.deleteMany({ where: { userId: other.referrer.id } });
      await expect(
        f.repo.overview({ ...f.scope, actorUserId: other.referrer.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        f.repo.execute(other.scope, {
          kind: 'REVIEW',
          commandId: randomUUID(),
          referralId: f.referral.id,
          expectedRevision: 0,
          review: 'CLEAR',
          reason: 'Cross OEM',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await client.user.update({ where: { id: f.referrer.id }, data: { status: 'SUSPENDED' } });
      await expect(confirm(f, p.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('OEM may strengthen headquarters conditions but never relax or create HQ policy', async () => {
      const f = await fixture();
      const p = await policy(f);
      await client.platformAdmin.deleteMany({ where: { userId: f.referrer.id } });
      await expect(policy(f, p.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        f.repo.savePolicy(f.scope, {
          expectedPolicyVersionId: p.id,
          authority: 'SERVICE',
          status: 'ACTIVE',
          timezone: p.timezone,
          conditions: { ...conditions, requireNewRegistration: false },
          reason: 'Relax',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      const next = await f.repo.savePolicy(f.scope, {
        expectedPolicyVersionId: p.id,
        authority: 'SERVICE',
        status: 'ACTIVE',
        timezone: p.timezone,
        conditions: { ...conditions, minimumActiveDays: 5 },
        reason: 'Strengthen',
      });
      expect(next.version).toBe(2);
      await review(f);
      await expect(confirm(f, next.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    });
    it('rejects self referrals and scoped cursor collisions', async () => {
      const f = await fixture();
      const other = await fixture();
      const p = await policy(f);
      await review(f);
      await client.serviceReferralCode.update({
        where: { id: f.referral.referralCodeId },
        data: { groupMembershipId: f.member.id, userId: f.owner.id },
      });
      await expect(confirm(f, p.id)).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(f.repo.overview(f.scope, other.referral.id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
    it('grants recorded milestones on confirmation, prevents grants across rule versions and preserves ledger on revoke', async () => {
      const f = await fixture();
      const p = await policy(f);
      const rewards = new PrismaServiceReferralRewardRepository(client);
      const rules = new PrismaServiceReferralRewardRuleRepository(client);
      const ruleInput = {
        workspaceId: f.workspace.id,
        groupId: f.group.id,
        actorUserId: f.referrer.id,
        now,
        status: 'ACTIVE' as const,
        rule: {
          ruleKey: 'onboarding-completed',
          milestone: 'ONBOARDING_COMPLETED' as const,
          recipient: 'REFERRER' as const,
          creditAmount: 2,
          expiresAfterDays: 30,
          monthlyGrantLimit: 1,
        },
      };
      await rules.saveVersion(ruleInput);
      const event = {
        workspaceId: f.workspace.id,
        groupId: f.group.id,
        referredUserId: f.owner.id,
        milestone: 'ONBOARDING_COMPLETED' as const,
        now,
      };
      expect(await rewards.completeMilestone(event)).toEqual([]);
      await review(f);
      await confirm(f, p.id);
      const account = await client.serviceCreditAccount.findFirstOrThrow({
        where: { workspaceId: f.workspace.id },
      });
      expect(account.availableCredits).toBe(2);
      await rules.saveVersion({ ...ruleInput, rule: { ...ruleInput.rule, creditAmount: 10 } });
      expect(await rewards.completeMilestone(event)).toEqual([]);
      expect(await client.serviceCreditLedger.count({ where: { accountId: account.id } })).toBe(1);
      await f.repo.execute(f.scope, {
        kind: 'REVOKE',
        commandId: randomUUID(),
        referralId: f.referral.id,
        expectedRevision: 2,
        reason: 'Cancel qualified referral',
      });
      expect(await rewards.completeMilestone(event)).toEqual([]);
      expect(
        (await client.serviceCreditAccount.findUniqueOrThrow({ where: { id: account.id } }))
          .availableCredits,
      ).toBe(2);
    });
    it('confirmation alone never invents milestones or grants', async () => {
      const f = await fixture();
      const p = await policy(f);
      await review(f);
      await confirm(f, p.id);
      expect(
        await client.serviceCreditLedger.count({ where: { workspaceId: f.workspace.id } }),
      ).toBe(0);
      expect(
        (await client.serviceReferral.findUniqueOrThrow({ where: { id: f.referral.id } }))
          .onboardingCompletedAt,
      ).toBeNull();
    });
    it('monthly grant cap holds concurrently and across reward-rule versions', async () => {
      const f = await fixture();
      const secondUser = await client.user.create({
        data: { displayName: 'Synthetic second referred' },
      });
      userIds.push(secondUser.id);
      const secondMember = await client.groupMembership.create({
        data: {
          workspaceId: f.workspace.id,
          groupId: f.group.id,
          userId: secondUser.id,
          status: 'ACTIVE',
          consentedAt: at,
        },
      });
      await client.serviceReferral.create({
        data: {
          workspaceId: f.workspace.id,
          groupId: f.group.id,
          referralCodeId: f.referral.referralCodeId,
          referredMembershipId: secondMember.id,
          referredUserId: secondUser.id,
          registeredAt: at,
        },
      });
      const rules = new PrismaServiceReferralRewardRuleRepository(client);
      const input = {
        workspaceId: f.workspace.id,
        groupId: f.group.id,
        actorUserId: f.referrer.id,
        now,
        status: 'ACTIVE' as const,
        rule: {
          ruleKey: 'onboarding-completed',
          milestone: 'ONBOARDING_COMPLETED' as const,
          recipient: 'REFERRER' as const,
          creditAmount: 2,
          monthlyGrantLimit: 1,
          expiresAfterDays: 30,
        },
      };
      await rules.saveVersion(input);
      const rewards = new PrismaServiceReferralRewardRepository(client);
      const event = {
        workspaceId: f.workspace.id,
        groupId: f.group.id,
        milestone: 'ONBOARDING_COMPLETED' as const,
        now,
      };
      const results = await Promise.all(
        [f.owner.id, secondUser.id].map((referredUserId) =>
          rewards.completeMilestone({ ...event, referredUserId }),
        ),
      );
      expect(results.flat()).toHaveLength(1);
      await rules.saveVersion(input);
      for (const referredUserId of [f.owner.id, secondUser.id])
        expect(await rewards.completeMilestone({ ...event, referredUserId })).toEqual([]);
      expect(
        await client.serviceCreditLedger.count({ where: { workspaceId: f.workspace.id } }),
      ).toBe(1);
    });
    it('count preserves asOf meaning after a later cancellation and never crosses a scoped policy FK', async () => {
      const f = await fixture();
      const other = await fixture();
      const p = await policy(f);
      const foreign = await policy(other);
      await expect(
        client.serviceReferral.update({
          where: { id: f.referral.id },
          data: {
            qualificationState: 'CONFIRMED',
            qualificationReview: 'CLEAR',
            confirmedAt: now,
            confirmedPolicyVersionId: foreign.id,
          },
        }),
      ).rejects.toThrow();
      await review(f);
      await confirm(f, p.id);
      const later = new Date(now.getTime() + 86_400_000);
      await new PrismaServiceReferralManagementRepository(client, () => later).execute(f.scope, {
        kind: 'REVOKE',
        referralId: f.referral.id,
        commandId: randomUUID(),
        expectedRevision: 2,
        reason: 'Later cancellation',
      });
      expect(await count(f)).toBe(1);
      expect(
        await client.$transaction((tx) =>
          readConfirmedReferralCount(
            tx,
            {
              ...f.request.scope,
              groupMembershipId: f.introducing.id,
              userId: f.referrer.id,
            },
            later,
          ),
        ),
      ).toBe(0);
    });
    it.each(['consent', 'member', 'user'] as const)(
      'privileged confirmation rechecks target %s state',
      async (kind) => {
        const f = await fixture();
        const p = await policy(f);
        await review(f);
        if (kind === 'consent')
          await client.groupMembership.update({
            where: { id: f.member.id },
            data: { consentedAt: new Date(now.getTime() + 86_400_000) },
          });
        if (kind === 'member')
          await client.groupMembership.update({
            where: { id: f.member.id },
            data: { status: 'SUSPENDED' },
          });
        if (kind === 'user')
          await client.user.update({
            where: { id: f.owner.id },
            data: { status: 'SUSPENDED' },
          });
        await expect(confirm(f, p.id)).rejects.toMatchObject({ code: 'CONFLICT' });
        expect(
          await client.serviceReferralQualificationAudit.count({
            where: { referralId: f.referral.id },
          }),
        ).toBe(1);
      },
    );
    it('RLS hides qualification history from an unprivileged database role', async () => {
      const f = await fixture();
      await policy(f);
      await review(f);
      const role = `referral_read_${randomUUID().replaceAll('-', '')}`;
      await client.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN`);
      try {
        await client.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
        await client.$executeRawUnsafe(
          `GRANT SELECT ON service_referral_qualification_policy_versions, service_referral_qualification_audits TO "${role}"`,
        );
        const rows = await client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
          return tx.$queryRaw<{ policies: bigint; audits: bigint }[]>`
            SELECT (SELECT count(*) FROM service_referral_qualification_policy_versions) AS policies,
              (SELECT count(*) FROM service_referral_qualification_audits) AS audits`;
        });
        expect(rows).toEqual([{ policies: 0n, audits: 0n }]);
      } finally {
        await client.$executeRawUnsafe(`DROP OWNED BY "${role}"`);
        await client.$executeRawUnsafe(`DROP ROLE "${role}"`);
      }
    });
    it('registration-only conditions do not require a fabricated Bunshin, while generation conditions remain pending', async () => {
      const f = await fixture();
      const p = await policy(f);
      await review(f);
      await client.bunshin.delete({ where: { id: f.bunshin.id } });
      expect((await confirm(f, p.id)).state).toBe('CONFIRMED');
      const other = await fixture();
      await client.bunshin.delete({ where: { id: other.bunshin.id } });
      const stricter = await other.repo.savePolicy(other.scope, {
        expectedPolicyVersionId: null,
        authority: 'HEADQUARTERS',
        status: 'ACTIVE',
        timezone: 'Asia/Tokyo',
        conditions: { ...conditions, requireFirstUserGeneration: true },
        reason: 'Require real generation',
      });
      await review(other);
      await expect(confirm(other, stricter.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    });
    it('a waiting snapshot cannot confirm a policy that headquarters has just stopped', async () => {
      const f = await fixture();
      const p = await policy(f);
      await review(f);
      const waiting = pausedSnapshotClient();
      const pending = new PrismaServiceReferralManagementRepository(
        waiting.client,
        () => now,
      ).execute(f.scope, {
        kind: 'CONFIRM',
        commandId: randomUUID(),
        referralId: f.referral.id,
        expectedRevision: 1,
        expectedPolicyVersionId: p.id,
        reason: 'Stale snapshot',
      });
      await waiting.ready;
      try {
        await policy(f, p.id, 'SUSPENDED');
      } finally {
        waiting.resume();
      }
      await expect(pending).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(waiting.attempts()).toBeGreaterThanOrEqual(2);
      expect(
        (await client.serviceReferral.findUniqueOrThrow({ where: { id: f.referral.id } }))
          .qualificationState,
      ).toBe('UNASSESSED');
    });
    it('a waiting confirmation uses the latest credit amount and cap after a reward-rule change', async () => {
      const f = await fixture();
      const p = await policy(f);
      await new PrismaServiceReferralRewardRepository(client).completeMilestone({
        workspaceId: f.workspace.id,
        groupId: f.group.id,
        referredUserId: f.owner.id,
        milestone: 'ONBOARDING_COMPLETED',
        now,
      });
      const rules = new PrismaServiceReferralRewardRuleRepository(client);
      const input = {
        workspaceId: f.workspace.id,
        groupId: f.group.id,
        actorUserId: f.referrer.id,
        now,
        status: 'ACTIVE' as const,
        rule: {
          ruleKey: 'onboarding-completed',
          milestone: 'ONBOARDING_COMPLETED' as const,
          recipient: 'REFERRER' as const,
          creditAmount: 10,
          monthlyGrantLimit: 10,
          expiresAfterDays: 30,
        },
      };
      await rules.saveVersion(input);
      await review(f);
      const waiting = pausedSnapshotClient();
      const pending = new PrismaServiceReferralManagementRepository(
        waiting.client,
        () => now,
      ).execute(f.scope, {
        kind: 'CONFIRM',
        commandId: randomUUID(),
        referralId: f.referral.id,
        expectedRevision: 1,
        expectedPolicyVersionId: p.id,
        reason: 'Wait for current credit settings',
      });
      await waiting.ready;
      let currentRuleId: string | undefined;
      try {
        const currentRule = await rules.saveVersion({
          ...input,
          rule: { ...input.rule, creditAmount: 1, monthlyGrantLimit: 1 },
        });
        currentRuleId = currentRule.id;
      } finally {
        waiting.resume();
      }
      expect((await pending).state).toBe('CONFIRMED');
      expect(waiting.attempts()).toBeGreaterThanOrEqual(2);
      expect(
        (
          await client.serviceCreditAccount.findFirstOrThrow({
            where: { workspaceId: f.workspace.id },
          })
        ).availableCredits,
      ).toBe(1);
      expect(
        (
          await client.serviceReferralReward.findFirstOrThrow({
            where: { referralId: f.referral.id },
          })
        ).ruleId,
      ).toBe(currentRuleId);
    });
    function pausedSnapshotClient() {
      let ready!: () => void;
      let resume!: () => void;
      let attempts = 0;
      const snapshotReady = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const released = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const waitingClient = {
        $transaction: (
          run: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: { isolationLevel: 'RepeatableRead'; maxWait: number; timeout: number },
        ) =>
          client.$transaction(async (tx) => {
            if (attempts++ === 0) {
              await tx.$queryRaw`SELECT 1`;
              ready();
              await released;
            }
            return run(tx);
          }, options),
      } as unknown as PrismaClient;
      return { client: waitingClient, ready: snapshotReady, resume, attempts: () => attempts };
    }
    async function fixture() {
      const owner = await client.user.create({ data: { displayName: 'Synthetic referred' } });
      const referrer = await client.user.create({ data: { displayName: 'Synthetic referrer' } });
      userIds.push(owner.id, referrer.id);
      const workspace = await client.workspace.create({
        data: { name: 'Synthetic referral', type: 'ORGANIZATION' },
      });
      workspaceIds.push(workspace.id);
      await client.workspaceMembership.createMany({
        data: [owner, referrer].map((user) => ({
          workspaceId: workspace.id,
          userId: user.id,
          role: 'MEMBER',
          status: 'ACTIVE',
        })),
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Synthetic' },
      });
      await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: randomUUID(),
          displayName: 'Synthetic',
          description: 'Synthetic',
          operatorName: 'Synthetic',
          createdByUserId: owner.id,
          updatedByUserId: owner.id,
        },
      });
      const member = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: owner.id,
          status: 'ACTIVE',
          consentedAt: at,
        },
      });
      const introducing = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: referrer.id,
          status: 'ACTIVE',
          consentedAt: at,
        },
      });
      const code = await client.serviceReferralCode.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          groupMembershipId: introducing.id,
          userId: referrer.id,
          code: randomUUID(),
        },
      });
      const referral = await client.serviceReferral.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          referralCodeId: code.id,
          referredMembershipId: member.id,
          referredUserId: owner.id,
          registeredAt: at,
          createdAt: at,
        },
      });
      const audit = await client.groupMembershipAuditLog.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          groupMembershipId: member.id,
          performedByUserId: owner.id,
          action: 'APPROVED',
          reason: 'public service registration',
          beforeData: {},
          afterData: { role: 'PARTICIPANT', status: 'ACTIVE' },
          occurredAt: at,
        },
      });
      const makeBunshin = (userId = owner.id) =>
        client.bunshin.create({
          data: {
            workspaceId: workspace.id,
            groupId: group.id,
            ownerUserId: userId,
            slug: randomUUID(),
            name: 'Synthetic',
            type: 'COPY',
            status: 'ACTIVE',
            objectiveSummary: 'Synthetic',
            audienceSummary: 'Synthetic',
            personalitySummary: 'Synthetic',
          },
        });
      const bunshin = await makeBunshin();
      const request = {
        actorUserId: owner.id,
        scope: {
          workspaceId: workspace.id,
          serviceId: group.id,
          groupMembershipId: member.id,
          userId: owner.id,
        },
        asOf: now,
        timezone: 'Asia/Tokyo',
      };
      await client.groupMembership.update({
        where: { id: introducing.id },
        data: { serviceRole: 'SERVICE_ADMIN' },
      });
      await client.platformAdmin.create({
        data: { userId: referrer.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      const scope = { workspaceId: workspace.id, serviceId: group.id, actorUserId: referrer.id };
      const repo = new PrismaServiceReferralManagementRepository(client, () => now);
      return {
        owner,
        referrer,
        workspace,
        group,
        member,
        referral,
        audit,
        bunshin,
        makeBunshin,
        request,
        repo,
        scope,
        introducing,
      };
    }
  });
}
