import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaSocialServiceReferralEvidenceRepository } from '../src/social-service-referral-evidence';
import { evaluateSocialServiceReferralQualification } from '@bunshin/capability-social';

const at = new Date('2026-11-01T00:00:00Z');
const now = new Date('2026-11-03T00:00:00Z');
/** Registered only after the existing disposable-database preflight. */
export function registerSocialServiceReferralEvidenceIntegrationCases(client: PrismaClient) {
  describe('SOCIAL referral evidence PostgreSQL', () => {
    const workspaceIds: string[] = [];
    const userIds: string[] = [];
    afterEach(async () => {
      const where = { workspaceId: { in: workspaceIds } };
      await client.missionActivity.deleteMany({ where });
      await client.dailyMission.deleteMany({ where });
      await client.serviceReferral.deleteMany({ where });
      await client.serviceReferralCode.deleteMany({ where });
      await client.bunshin.deleteMany({ where });
      await client.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await client.user.deleteMany({ where: { id: { in: userIds } } });
      workspaceIds.length = 0;
      userIds.length = 0;
    });
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
      const repo = new PrismaSocialServiceReferralEvidenceRepository(client, () => now);
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
      };
    }
    it('reads existing attribution/audit without creating credit or qualifying an unreviewed member', async () => {
      const f = await fixture();
      const evidence = await f.repo.read(f.request);
      expect(evidence).toMatchObject({
        newRegistration: true,
        review: 'UNKNOWN',
        uniqueAttribution: true,
      });
      expect(
        evaluateSocialServiceReferralQualification(
          {
            scope: f.request.scope,
            ruleKey: 'synthetic',
            version: 1,
            status: 'ACTIVE',
            timezone: 'Asia/Tokyo',
            requireNewRegistration: true,
            requireOnboarding: false,
            requireFirstUserGeneration: false,
            minimumActiveDays: 0,
          },
          evidence!,
          now,
        ),
      ).toMatchObject({ decision: 'UNKNOWN', reasons: ['REVIEW_UNKNOWN'] });
      expect(
        await client.serviceCreditAccount.count({ where: { workspaceId: f.workspace.id } }),
      ).toBe(0);
      expect(
        await client.serviceReferralReward.count({ where: { workspaceId: f.workspace.id } }),
      ).toBe(0);
    });
    it.each(['missing', 'existing', 'ambiguous'] as const)(
      'projects %s registration history conservatively',
      async (kind) => {
        const f = await fixture();
        if (kind === 'missing')
          await client.groupMembershipAuditLog.delete({ where: { id: f.audit.id } });
        if (kind === 'existing')
          await client.groupMembershipAuditLog.update({
            where: { id: f.audit.id },
            data: { beforeData: { status: 'ACTIVE' } },
          });
        if (kind === 'ambiguous')
          await client.groupMembershipAuditLog.create({
            data: {
              workspaceId: f.workspace.id,
              groupId: f.group.id,
              groupMembershipId: f.member.id,
              performedByUserId: f.owner.id,
              action: 'APPROVED',
              reason: 'public service registration',
              beforeData: {},
              afterData: { role: 'PARTICIPANT', status: 'ACTIVE' },
              occurredAt: at,
            },
          });
        expect((await f.repo.read(f.request))?.newRegistration).toBe(
          kind === 'existing' ? false : null,
        );
      },
    );
    it('reads only the same member owned Bunshins across the service', async () => {
      const f = await fixture();
      const second = await f.makeBunshin();
      const foreign = await f.makeBunshin(f.referrer.id);
      for (const bunshin of [f.bunshin, second, foreign]) {
        const mission = await client.dailyMission.create({
          data: {
            workspaceId: f.workspace.id,
            bunshinId: bunshin.id,
            missionDate: at,
            format: 'TEXT',
            estimatedMinutes: 5,
            topic: 'PRIVATE_TOPIC',
            angle: 'PRIVATE',
            reason: 'PRIVATE',
            createdAt: at,
          },
        });
        await client.missionActivity.create({
          data: {
            workspaceId: f.workspace.id,
            bunshinId: bunshin.id,
            dailyMissionId: mission.id,
            actorUserId: bunshin.ownerUserId,
            idempotencyKey: randomUUID(),
            type: 'COPIED_TEXT',
            occurredAt: at,
          },
        });
      }
      const evidence = await f.repo.read(f.request);
      expect(evidence?.activities).toHaveLength(2);
      expect(new Set(evidence?.activities.map((entry) => entry.scope.bunshinId))).toEqual(
        new Set([f.bunshin.id, second.id]),
      );
      expect(JSON.stringify(evidence)).not.toContain('PRIVATE');
    });
    it('denies a referrer reading the referred owner evidence', async () => {
      const f = await fixture();
      await expect(f.repo.read({ ...f.request, actorUserId: f.referrer.id })).rejects.toMatchObject(
        { code: 'VALIDATION_ERROR' },
      );
    });
    it.each(['serviceId', 'workspaceId', 'groupMembershipId'] as const)(
      'denies a foreign %s',
      async (key) => {
        const f = await fixture();
        expect(
          await f.repo.read({ ...f.request, scope: { ...f.request.scope, [key]: randomUUID() } }),
        ).toBeNull();
      },
    );
    it('revalidates revoked membership and changed ownership', async () => {
      const f = await fixture();
      await client.groupMembership.update({
        where: { id: f.member.id },
        data: { status: 'REVOKED', revokedAt: now },
      });
      expect(await f.repo.read(f.request)).toBeNull();
      await client.groupMembership.update({
        where: { id: f.member.id },
        data: { status: 'ACTIVE', revokedAt: null },
      });
      await client.bunshin.update({
        where: { id: f.bunshin.id },
        data: { ownerUserId: f.referrer.id },
      });
      expect(await f.repo.read(f.request)).toBeNull();
    });
  });
}
