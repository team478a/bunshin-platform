import { randomUUID } from 'node:crypto';
import { evidenceTestPolicy } from './member-roadmap-policy-fixture';
import type { PrismaClient } from '@prisma/client';
import {
  GetMemberRoadmap,
  GetMemberUsageSummary,
  type MemberUsageRequest,
} from '@bunshin/application';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaMemberRoadmapContextRepository } from '../src/member-roadmap-context';
import { PrismaMemberUsageRepository } from '../src/member-usage-repository';

const at = new Date('2026-10-31T15:00:00Z');
const now = new Date('2026-11-03T00:00:00Z');

/** Registered only inside the disposable DB preflight of database.integration.test.ts. */
export function registerMemberRoadmapContextIntegrationCases(client: PrismaClient) {
  describe('roadmap context PostgreSQL', () => {
    const workspaces: string[] = [];
    const users: string[] = [];
    afterEach(async () => {
      const where = { workspaceId: { in: workspaces } };
      await client.socialInsightSnapshot.deleteMany({ where });
      await client.missionActivity.deleteMany({ where });
      await client.missionDecision.deleteMany({ where });
      await client.missionContent.deleteMany({ where });
      await client.dailyMission.deleteMany({ where });
      await client.weeklyPlan.deleteMany({ where });
      await client.socialProfile.deleteMany({ where });
      await client.bunshinCapabilityAssignment.deleteMany({ where });
      await client.bunshin.deleteMany({ where });
      await client.workspace.deleteMany({ where: { id: { in: workspaces } } });
      await client.platformAdmin.deleteMany({ where: { userId: { in: users } } });
      await client.user.deleteMany({ where: { id: { in: users } } });
      workspaces.length = 0;
      users.length = 0;
    });

    async function fixture(existingUserId?: string) {
      const userId =
        existingUserId ??
        (await client.user.create({ data: { displayName: 'Synthetic roadmap owner' } })).id;
      if (!existingUserId) users.push(userId);
      const workspace = await client.workspace.create({
        data: { name: 'Synthetic roadmap', type: 'ORGANIZATION' },
      });
      workspaces.push(workspace.id);
      await client.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId, role: 'MEMBER', status: 'ACTIVE' },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Synthetic roadmap' },
      });
      const configuration = await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: `roadmap-${randomUUID()}`,
          displayName: 'Synthetic',
          description: 'Synthetic',
          operatorName: 'Synthetic',
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
      const membership = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId,
          status: 'ACTIVE',
          consentedAt: at,
        },
      });
      const bunshin = await client.bunshin.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          ownerUserId: userId,
          slug: `roadmap-${randomUUID()}`,
          name: 'Synthetic',
          type: 'COPY',
          status: 'ACTIVE',
          objectiveSummary: 'Synthetic',
          audienceSummary: 'Synthetic',
          personalitySummary: 'Synthetic',
          createdAt: at,
        },
      });
      await client.bunshinCapabilityAssignment.create({
        data: {
          workspaceId: workspace.id,
          bunshinId: bunshin.id,
          capabilityType: 'SOCIAL',
          status: 'ACTIVE',
          assignedByUserId: userId,
          activatedAt: at,
        },
      });
      await client.groupFeaturePolicy.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          featureKey: 'SOCIAL',
          status: 'ENABLED',
          setByUserId: userId,
        },
      });
      await client.groupMemberFeatureAssignment.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          groupMembershipId: membership.id,
          featureKey: 'SOCIAL',
          status: 'ENABLED',
          assignedByUserId: userId,
        },
      });
      const request: MemberUsageRequest = {
        actorUserId: userId,
        timezone: 'Asia/Tokyo',
        asOf: new Date('2026-11-02T00:00:00Z'),
        scope: {
          workspaceId: workspace.id,
          serviceId: group.id,
          groupMembershipId: membership.id,
          userId,
          bunshinId: bunshin.id,
        },
      };
      const repository = new PrismaMemberRoadmapContextRepository(client, () => now);
      const usage = new PrismaMemberUsageRepository(client, () => now);
      return {
        userId,
        workspace,
        group,
        membership,
        bunshin,
        configuration,
        request,
        repository,
        read: () => repository.read(request),
        roadmap: () =>
          new GetMemberRoadmap(
            new GetMemberUsageSummary(usage, usage),
            repository,
            evidenceTestPolicy,
          ).execute(request),
      };
    }
    async function evidence(f: Awaited<ReturnType<typeof fixture>>, date = at) {
      const {
        workspaceId,
        serviceId: groupId,
        groupMembershipId,
        userId,
        bunshinId,
      } = f.request.scope;
      await client.serviceOnboardingResponse.create({
        data: {
          workspaceId,
          groupId,
          groupMembershipId,
          userId,
          questionsSnapshot: ['DO_NOT_READ_QUESTION'],
          answers: [{ question: 'DO_NOT_READ', answer: 'DO_NOT_READ_ANSWER' }],
          completedAt: date,
          createdAt: date,
        },
      });
      const profile = await client.socialProfile.create({
        data: {
          workspaceId,
          bunshinId,
          platform: 'X',
          purpose: 'DO_NOT_READ_PURPOSE',
          postingFrequency: 'DAILY',
          preferredFormats: ['TEXT'],
          createdAt: date,
        },
      });
      await client.weeklyPlan.create({
        data: {
          workspaceId,
          bunshinId,
          weekStartDate: new Date('2026-10-26Z'),
          timezone: 'Asia/Tokyo',
          status: 'EXPIRED',
          confirmedAt: date,
          expiredAt: new Date('2026-11-01Z'),
          createdAt: date,
        },
      });
      const mission = await client.dailyMission.create({
        data: {
          workspaceId,
          bunshinId,
          missionDate: date,
          status: 'GENERATED',
          format: 'TEXT',
          estimatedMinutes: 5,
          topic: 'DO_NOT_READ_TOPIC',
          angle: 'Synthetic',
          reason: 'Synthetic',
          createdAt: date,
        },
      });
      await client.missionContent.create({
        data: {
          workspaceId,
          bunshinId,
          dailyMissionId: mission.id,
          format: 'TEXT',
          contentJson: { body: 'DO_NOT_READ_CONTENT' },
          createdAt: date,
        },
      });
      await client.missionDecision.create({
        data: {
          workspaceId,
          bunshinId,
          dailyMissionId: mission.id,
          decision: 'PENDING',
          createdAt: date,
        },
      });
      await client.missionActivity.create({
        data: {
          workspaceId,
          bunshinId,
          dailyMissionId: mission.id,
          actorUserId: userId,
          type: 'COPIED_TEXT',
          idempotencyKey: randomUUID(),
          occurredAt: date,
        },
      });
      await client.socialInsightSnapshot.create({
        data: {
          workspaceId,
          groupId,
          groupMembershipId,
          userId,
          bunshinId,
          socialProfileId: profile.id,
          platform: 'X',
          observedOn: date,
          source: 'MANUAL',
          followers: 987654321,
          createdAt: date,
        },
      });
      return { profile, mission };
    }

    it('returns only proven facts, preserves missing history/referral evidence, and never writes usage', async () => {
      const f = await fixture();
      await evidence(f);
      const before = await client.groupMembership.findUniqueOrThrow({
        where: { id: f.membership.id },
        select: { lastUsedAt: true, updatedAt: true },
      });
      const value = await f.read();
      expect(value?.facts).toEqual({
        INITIAL_SETUP: true,
        WEEKLY_PLAN: true,
        POST_PREPARATION: true,
        SNS_METRICS: true,
      });
      expect(value?.validReferrals).toBeNull();
      expect(value?.facts.POST_HISTORY).toBeUndefined();
      expect(JSON.stringify(value)).not.toContain('DO_NOT_READ');
      expect(JSON.stringify(value)).not.toContain('987654321');
      expect((await f.roadmap()).nextRecommended).toEqual({
        stageId: 'STEP_1',
        milestoneId: 'FIRST_DECISION',
      });
      expect(
        await client.groupFeatureUsageEvent.count({ where: { workspaceId: f.workspace.id } }),
      ).toBe(0);
      expect(
        await client.groupFeatureAuditLog.count({ where: { workspaceId: f.workspace.id } }),
      ).toBe(0);
      expect(
        await client.groupMembership.findUniqueOrThrow({
          where: { id: f.membership.id },
          select: { lastUsedAt: true, updatedAt: true },
        }),
      ).toEqual(before);
    });

    it('supports old users without inventing facts or operational readiness', async () => {
      const f = await fixture();
      const value = await f.read();
      expect(Object.values(value!.facts).every((fact) => fact === null)).toBe(true);
      expect(value?.features.FIRST_DECISION?.readyForRecommendation).toBe(false);
      expect(value?.features.SNS_METRICS?.readyForRecommendation).toBe(false);
      expect((await f.roadmap()).nextRecommended).toBeNull();
    });

    it('excludes future proof while applying current access independently of historical asOf', async () => {
      const f = await fixture();
      await evidence(f);
      f.request.asOf = new Date('2026-10-30Z');
      expect(Object.values((await f.read())!.facts).every((fact) => fact === null)).toBe(true);
      expect((await f.read())?.features.FIRST_DECISION?.readyForRecommendation).toBe(true);
      await client.groupFeaturePolicy.update({
        where: { groupId_featureKey: { groupId: f.group.id, featureKey: 'SOCIAL' } },
        data: { endsAt: now },
      });
      expect((await f.read())?.features.FIRST_DECISION?.access).toMatchObject({
        allowed: false,
        reason: 'OUTSIDE_VALIDITY_PERIOD',
      });
    });

    it('does not share a membership questionnaire or history implicitly with another Bunshin', async () => {
      const f = await fixture();
      await evidence(f);
      const other = await client.bunshin.create({
        data: {
          workspaceId: f.workspace.id,
          groupId: f.group.id,
          ownerUserId: f.userId,
          slug: `other-${randomUUID()}`,
          name: 'Other',
          type: 'COPY',
          status: 'ACTIVE',
          objectiveSummary: 'Synthetic',
          audienceSummary: 'Synthetic',
          personalitySummary: 'Synthetic',
        },
      });
      const value = await f.repository.read({
        ...f.request,
        scope: { ...f.request.scope, bunshinId: other.id },
      });
      expect(Object.values(value!.facts).every((fact) => fact === null)).toBe(true);
      expect(value?.features.FIRST_DECISION?.enabled).toBe(false);
    });

    it('rejects cross-OEM/Bunshin scopes even for a global admin belonging to both services', async () => {
      const f = await fixture();
      const other = await fixture(f.userId);
      await evidence(f);
      await client.platformAdmin.create({ data: { userId: f.userId, role: 'SUPER_ADMIN' } });
      expect(
        await f.repository.read({
          ...f.request,
          scope: { ...f.request.scope, serviceId: other.group.id },
        }),
      ).toBeNull();
      expect(
        await f.repository.read({
          ...other.request,
          scope: { ...other.request.scope, bunshinId: f.bunshin.id },
        }),
      ).toBeNull();
      expect((await other.read())?.facts.INITIAL_SETUP).toBeNull();
    });

    it.each(['member', 'user', 'workspace', 'bunshin'] as const)(
      'denies current %s revocation rather than trusting the old snapshot',
      async (reason) => {
        const f = await fixture();
        await evidence(f);
        if (reason === 'member')
          await client.groupMembership.update({
            where: { id: f.membership.id },
            data: { status: 'REVOKED', revokedAt: now },
          });
        if (reason === 'user')
          await client.user.update({ where: { id: f.userId }, data: { status: 'SUSPENDED' } });
        if (reason === 'workspace')
          await client.workspace.update({
            where: { id: f.workspace.id },
            data: { status: 'SUSPENDED' },
          });
        if (reason === 'bunshin')
          await client.bunshin.update({
            where: { id: f.bunshin.id },
            data: { status: 'ARCHIVED' },
          });
        expect(await f.read()).toBeNull();
      },
    );

    it.each(['capability', 'paused', 'future-activation'] as const)(
      'keeps completed evidence with %s disabled now',
      async (reason) => {
        const f = await fixture();
        await evidence(f);
        if (reason === 'capability')
          await client.bunshinCapabilityAssignment.deleteMany({
            where: { workspaceId: f.workspace.id, bunshinId: f.bunshin.id },
          });
        if (reason === 'paused')
          await client.bunshin.update({ where: { id: f.bunshin.id }, data: { status: 'PAUSED' } });
        if (reason === 'future-activation')
          await client.bunshinCapabilityAssignment.updateMany({
            where: { workspaceId: f.workspace.id, bunshinId: f.bunshin.id },
            data: { activatedAt: new Date(now.getTime() + 1) },
          });
        const value = await f.read();
        expect(value?.facts.INITIAL_SETUP).toBe(true);
        expect(value?.features.FIRST_DECISION?.enabled).toBe(false);
        expect((await f.roadmap()).nextRecommended).toBeNull();
      },
    );

    it('honors explicit entitlement denial while preserving completed facts', async () => {
      const f = await fixture();
      await evidence(f);
      await client.groupMemberFeatureAssignment.updateMany({
        where: { workspaceId: f.workspace.id },
        data: { status: 'DISABLED' },
      });
      const value = await f.read();
      expect(value?.facts.WEEKLY_PLAN).toBe(true);
      expect(value?.features.FIRST_DECISION?.access).toMatchObject({
        allowed: false,
        reason: 'MEMBER_NOT_ALLOWED',
      });
      expect((await f.roadmap()).nextRecommended).toBeNull();
    });

    it('requires consent to the current legal version, not the version at asOf', async () => {
      const f = await fixture();
      const data = {
        workspaceId: f.workspace.id,
        groupId: f.group.id,
        configurationId: f.configuration.id,
        type: 'TERMS' as const,
        title: 'Synthetic',
        content: 'Synthetic',
        status: 'PUBLISHED' as const,
        createdByUserId: f.userId,
      };
      const old = await client.serviceLegalDocument.create({
        data: { ...data, version: 1, effectiveAt: at },
      });
      const current = await client.serviceLegalDocument.create({
        data: { ...data, version: 2, effectiveAt: new Date('2026-11-02Z') },
      });
      const consent = {
        workspaceId: f.workspace.id,
        groupId: f.group.id,
        groupMembershipId: f.membership.id,
        userId: f.userId,
        consentedAt: at,
      };
      await client.serviceLegalConsent.create({ data: { ...consent, legalDocumentId: old.id } });
      expect(await f.read()).toBeNull();
      await client.serviceLegalConsent.create({
        data: { ...consent, legalDocumentId: current.id },
      });
      expect(await f.read()).not.toBeNull();
    });
  });
}
