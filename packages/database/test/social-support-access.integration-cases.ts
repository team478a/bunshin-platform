import {
  defaultSocialRecommendationSettings,
  SOCIAL_RECOMMENDATION_POLICY_CONFIG_KEY,
} from '@bunshin/capability-social';
import { PrismaSocialRecommendationPolicyRepository } from '../src/social-recommendation-policy';
import {
  PrismaGroupFeatureEntitlementRepository,
  MANAGED_FEATURE_POLICY_CONFIG_KEY,
} from '../src/group-feature-entitlement';
import { PrismaSocialActivityBarrierCaseRepository } from '../src/social-activity-barrier-repository';
import { PrismaHassySupportImprovementAdapter } from '../src/hassy-improvement-support-adapter';
import { randomUUID } from 'node:crypto';
import type { PrismaClient, SocialActivityBarrierCategory } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaSocialSupportBehaviorAdapter } from '../src/social-support-behavior-adapter';
import { PrismaSocialActivityBarrierConfirmationRepository } from '../src/social-activity-barrier-confirmation-repository';

const at = new Date('2026-11-01T00:00:00Z');
const now = new Date('2026-11-03T00:00:00Z');
export function registerSocialSupportAccessIntegrationCases(client: PrismaClient) {
  describe('SOCIAL support access and feedback PostgreSQL', () => {
    const workspaces: string[] = [];
    const users: string[] = [];
    afterEach(async () => {
      const where = { workspaceId: { in: workspaces } };
      await client.socialActivityBarrierCase.deleteMany({ where });
      await client.dailyMission.deleteMany({ where });
      await client.bunshinCapabilityAssignment.deleteMany({ where });
      await client.bunshin.deleteMany({ where });
      await client.workspace.deleteMany({ where: { id: { in: workspaces } } });
      await client.user.deleteMany({ where: { id: { in: users } } });
      workspaces.length = 0;
      users.length = 0;
    });
    async function fixture() {
      const user = await client.user.create({ data: { displayName: 'Synthetic support owner' } });
      users.push(user.id);
      const workspace = await client.workspace.create({
        data: { name: 'Synthetic support', type: 'ORGANIZATION' },
      });
      workspaces.push(workspace.id);
      await client.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: user.id, status: 'ACTIVE', role: 'MEMBER' },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Synthetic support' },
      });
      await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: randomUUID(),
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
          consentedAt: at,
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
          activatedAt: at,
          assignedByUserId: user.id,
        },
      });
      for (const key of ['SOCIAL', 'SOCIAL.ACTIVITY_SUPPORT']) {
        await client.featureDefinition.upsert({
          where: { key },
          update: {},
          create: {
            key,
            parentKey: key === 'SOCIAL' ? null : 'SOCIAL',
            name: 'Synthetic',
            description: 'Synthetic',
            status: 'ACTIVE',
          },
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
      const scope = {
        workspaceId: workspace.id,
        serviceId: group.id,
        groupMembershipId: member.id,
        userId: user.id,
        bunshinId: bunshin.id,
      };
      const addCase = (category: SocialActivityBarrierCategory = 'TIME') =>
        client.socialActivityBarrierCase.create({
          data: {
            workspaceId: workspace.id,
            groupId: group.id,
            groupMembershipId: member.id,
            userId: user.id,
            bunshinId: bunshin.id,
            category,
            status: 'SUSPECTED',
            ruleVersion: 'social-activity-barrier-v4',
            firstDetectedAt: at,
            lastDetectedAt: at,
            evidenceSnapshots: {
              create: {
                evidenceKey: randomUUID(),
                evidenceCode: 'ACCEPTED_WITHOUT_POST_REPORT',
                observationFrom: at,
                observationTo: now,
                eligibleDays: 2,
                excludedSystemIncidentDays: 0,
                metrics: { missionAccepted: 2, postCompleted: 0 },
                thresholds: { minimumAccepted: 2, maximumPostReports: 0 },
                ruleVersion: 'social-activity-barrier-v4',
                detectedAt: at,
              },
            },
          },
        });
      const row = await addCase();
      const repo = new PrismaSocialActivityBarrierConfirmationRepository(client, () => now);
      const answer = {
        scope,
        caseIds: [row.id],
        selectedCaseId: row.id,
        idempotencyKey: randomUUID(),
        answeredAt: now,
      };
      const stop = () =>
        client.groupFeaturePolicy.updateMany({
          where: {
            workspaceId: workspace.id,
            groupId: group.id,
            featureKey: 'SOCIAL.ACTIVITY_SUPPORT',
          },
          data: { status: 'DISABLED' },
        });
      return { scope, row, repo, answer, stop, addCase };
    }
    async function policyFixture() {
      const f = await fixture();
      await client.groupMembership.update({
        where: { id: f.scope.groupMembershipId },
        data: { serviceRole: 'SERVICE_OWNER' },
      });
      const hq = await client.user.create({
        data: { displayName: 'Synthetic HQ policy operator' },
      });
      users.push(hq.id);
      await client.platformAdmin.create({ data: { userId: hq.id, role: 'SUPER_ADMIN' } });
      const target = {
        workspaceId: f.scope.workspaceId,
        serviceId: f.scope.serviceId,
        actorUserId: hq.id,
      };
      const owner = { ...target, actorUserId: f.scope.userId };
      const policies = new PrismaSocialRecommendationPolicyRepository(client);
      const command = (expectedRevision = 0, settings = defaultSocialRecommendationSettings()) => ({
        ...target,
        commandId: randomUUID(),
        expectedRevision,
        authority: 'HEADQUARTERS' as const,
        settings,
        reason: 'Synthetic policy verification',
      });
      return { ...f, target, owner, policies, command };
    }
    it('saves versioned policy once, preserves other config and rejects payload collisions or stale writes', async () => {
      const f = await policyFixture();
      await client.groupFeaturePolicy.update({
        where: {
          groupId_featureKey: { groupId: f.scope.serviceId, featureKey: 'SOCIAL.ACTIVITY_SUPPORT' },
        },
        data: { config: { legacySetting: 'preserved' } },
      });
      const cmd = f.command();
      const saved = await f.policies.save(cmd);
      expect(saved.revision).toBe(1);
      expect(
        await f.policies.save({
          ...cmd,
          settings: { ...cmd.settings, categories: [...cmd.settings.categories].reverse() },
        }),
      ).toEqual(saved);
      await expect(f.policies.save({ ...cmd, reason: 'Different reason' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      await expect(f.policies.save(f.command())).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(
        await client.groupFeatureAuditLog.count({ where: { groupId: f.scope.serviceId } }),
      ).toBe(1);
      expect(
        await client.groupFeaturePolicy.findUniqueOrThrow({
          where: {
            groupId_featureKey: {
              groupId: f.scope.serviceId,
              featureKey: 'SOCIAL.ACTIVITY_SUPPORT',
            },
          },
        }),
      ).toMatchObject({ status: 'ENABLED', config: { legacySetting: 'preserved' } });
    });
    it('permits only one concurrent update at the same revision', async () => {
      const f = await policyFixture();
      const results = await Promise.allSettled([
        f.policies.save(f.command()),
        f.policies.save(f.command()),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(
        await client.groupFeatureAuditLog.count({ where: { groupId: f.scope.serviceId } }),
      ).toBe(1);
    });
    it('requires headquarters before OEM changes and enforces bounds after headquarters tightens them', async () => {
      const f = await policyFixture();
      await expect(
        f.policies.save({ ...f.command(), ...f.owner, authority: 'SERVICE' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(f.policies.save({ ...f.command(), ...f.owner })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      const hq = {
        ...defaultSocialRecommendationSettings(),
        minimumAccepted: 4,
        cooldownDays: 60,
        categories: ['TIME' as const],
      };
      await f.policies.save(f.command(0, hq));
      await expect(
        f.policies.save({ ...f.command(1), ...f.owner, authority: 'SERVICE' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const service = await f.policies.save({
        ...f.command(1, { ...hq, minimumAccepted: 5, cooldownDays: 90 }),
        ...f.owner,
        authority: 'SERVICE',
      });
      expect(service.effective.minimumAccepted).toBe(5);
      const tightened = await f.policies.save(
        f.command(2, { ...hq, minimumAccepted: 6, cooldownDays: 120, enabled: false }),
      );
      expect(tightened.effective).toMatchObject({
        enabled: false,
        minimumAccepted: 6,
        cooldownDays: 120,
        categories: ['TIME'],
      });
      expect(tightened.service?.minimumAccepted).toBe(5);
    });
    it('rejects participants, other OEMs and revoked management roles', async () => {
      const f = await policyFixture();
      const other = await policyFixture();
      await expect(
        f.policies.read({ ...other.target, actorUserId: f.scope.userId }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await client.groupMembership.update({
        where: { id: f.scope.groupMembershipId },
        data: { serviceRole: 'PARTICIPANT' },
      });
      await expect(f.policies.read(f.owner)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(f.policies.save({ ...f.command(), ...f.owner })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
    it('rechecks persisted evidence at projection, display and answer against current settings', async () => {
      const f = await policyFixture();
      await f.policies.save(
        f.command(0, {
          ...defaultSocialRecommendationSettings(),
          minimumAccepted: 4,
          categories: ['TIME'],
        }),
      );
      expect(await f.repo.getPendingQuestion({ scope: f.scope })).toBeNull();
      expect(await f.repo.answer(f.answer)).toBeNull();
      const cases = new PrismaSocialActivityBarrierCaseRepository(client);
      const candidate = {
        scope: f.scope,
        category: 'TIME' as const,
        status: 'SUSPECTED' as const,
        priority: 1,
        evidence: {
          evidenceCode: 'ACCEPTED_WITHOUT_POST_REPORT' as const,
          observationWindow: {
            from: at.toISOString(),
            to: now.toISOString(),
            eligibleDays: 2,
            excludedSystemIncidentDays: 0,
          },
          metrics: { missionAccepted: 3, postCompleted: 0 },
          goalAttribution: null,
          goalMetrics: null,
          thresholds: { minimumAccepted: 2 },
          ruleVersion: 'social-activity-barrier-v4' as const,
        },
      };
      expect(
        await cases.saveSuspicions({ scope: f.scope, candidates: [candidate], detectedAt: now }),
      ).toEqual([]);
      candidate.evidence.metrics.missionAccepted = 4;
      const saved = await cases.saveSuspicions({
        scope: f.scope,
        candidates: [candidate],
        detectedAt: now,
      });
      expect(saved?.[0]?.evidence.thresholds).toMatchObject({
        minimumAccepted: 4,
        recommendationPolicyRevision: 1,
      });
      expect((await f.repo.getPendingQuestion({ scope: f.scope }))?.caseIds).toEqual([f.row.id]);
      const media = await f.addCase('MEDIA');
      expect(
        await f.repo.answer({ ...f.answer, caseIds: [media.id], selectedCaseId: media.id }),
      ).toBeNull();
      expect(await f.repo.answer(f.answer)).not.toBeNull();
    });
    it('freezes offered cooldowns, stops new starts and preserves accepted work after policy stop', async () => {
      const f = await policyFixture();
      await f.policies.save(
        f.command(0, { ...defaultSocialRecommendationSettings(), cooldownDays: 60 }),
      );
      await f.repo.answer(f.answer);
      const support = await f.repo.getActiveSupport({ scope: f.scope });
      await f.repo.transitionSupport({
        scope: f.scope,
        supportId: support!.id,
        action: 'ACCEPT',
        occurredAt: now,
      });
      await f.policies.save(
        f.command(1, {
          ...defaultSocialRecommendationSettings(),
          enabled: false,
          cooldownDays: 90,
        }),
      );
      expect((await f.repo.getActiveSupport({ scope: f.scope }))?.status).toBe('ACCEPTED');
      expect(await f.repo.getPendingQuestion({ scope: f.scope })).toBeNull();
      expect(
        await f.repo.transitionSupport({
          scope: f.scope,
          supportId: support!.id,
          action: 'ACCEPT',
          occurredAt: now,
        }),
      ).toBeNull();
      expect(
        (
          await f.repo.transitionSupport({
            scope: f.scope,
            supportId: support!.id,
            action: 'SKIP',
            occurredAt: now,
          })
        )?.status,
      ).toBe('SKIPPED');
      expect(
        (await client.socialActivityBarrierCase.findUniqueOrThrow({ where: { id: f.row.id } }))
          .nextEligibleAt,
      ).toEqual(new Date(now.getTime() + 60 * 86_400_000));
    });
    it('suppresses unstarted support after stop and applies configured dismissal days to none-of-these', async () => {
      const f = await policyFixture();
      await f.policies.save(
        f.command(0, { ...defaultSocialRecommendationSettings(), cooldownDays: 45 }),
      );
      await f.repo.answer({ ...f.answer, selectedCaseId: null });
      expect(
        (await client.socialActivityBarrierCase.findUniqueOrThrow({ where: { id: f.row.id } }))
          .nextEligibleAt,
      ).toEqual(new Date(now.getTime() + 45 * 86_400_000));
      const other = await policyFixture();
      await other.policies.save(other.command());
      await other.repo.answer(other.answer);
      const offered = await other.repo.getActiveSupport({ scope: other.scope });
      await other.policies.save(
        other.command(1, { ...defaultSocialRecommendationSettings(), enabled: false }),
      );
      expect(await other.repo.getActiveSupport({ scope: other.scope })).toBeNull();
      expect(
        await other.repo.transitionSupport({
          scope: other.scope,
          supportId: offered!.id,
          action: 'ACCEPT',
          occurredAt: now,
        }),
      ).toBeNull();
    });
    it('fails closed on invalid stored config while preserving completion of already accepted work', async () => {
      const f = await policyFixture();
      await f.policies.save(f.command());
      await f.repo.answer(f.answer);
      const support = await f.repo.getActiveSupport({ scope: f.scope });
      await f.repo.transitionSupport({
        scope: f.scope,
        supportId: support!.id,
        action: 'ACCEPT',
        occurredAt: now,
      });
      await client.groupFeaturePolicy.update({
        where: {
          groupId_featureKey: { groupId: f.scope.serviceId, featureKey: 'SOCIAL.ACTIVITY_SUPPORT' },
        },
        data: {
          config: {
            [MANAGED_FEATURE_POLICY_CONFIG_KEY]: {
              [SOCIAL_RECOMMENDATION_POLICY_CONFIG_KEY]: { version: 'invalid' },
            },
          },
        },
      });
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect(await f.repo.getPendingQuestion({ scope: f.scope })).toBeNull();
        expect((await f.repo.getActiveSupport({ scope: f.scope }))?.status).toBe('ACCEPTED');
        expect(
          (
            await f.repo.transitionSupport({
              scope: f.scope,
              supportId: support!.id,
              action: 'COMPLETE',
              occurredAt: now,
            })
          )?.status,
        ).toBe('COMPLETED');
        await expect(f.policies.read(f.target)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
        expect(log).toHaveBeenCalled();
      } finally {
        log.mockRestore();
      }
    });
    it('preserves managed settings through generic feature writes and rejects namespace injection', async () => {
      const f = await policyFixture();
      await f.policies.save(f.command());
      const generic = new PrismaGroupFeatureEntitlementRepository(client);
      const command = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.serviceId,
        actorUserId: f.target.actorUserId,
        featureKey: 'SOCIAL.ACTIVITY_SUPPORT',
        status: 'ENABLED' as const,
        dailyLimit: 5,
        monthlyLimit: 10,
        config: {},
        reason: 'Synthetic generic feature update',
      };
      await generic.setGroupPolicy(command);
      expect((await f.policies.read(f.target)).revision).toBe(1);
      await expect(
        generic.setGroupPolicy({
          ...command,
          config: {
            [MANAGED_FEATURE_POLICY_CONFIG_KEY]: { [SOCIAL_RECOMMENDATION_POLICY_CONFIG_KEY]: {} },
          },
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await Promise.all([
        generic.setGroupPolicy(command),
        f.policies.save(
          f.command(1, { ...defaultSocialRecommendationSettings(), minimumAccepted: 5 }),
        ),
      ]);
      expect((await f.policies.read(f.target)).effective.minimumAccepted).toBe(5);
      expect((await f.policies.read(f.target)).revision).toBe(2);
    });
    it('serializes concurrent first display/detail receipts and preserves lifecycle and first timestamps', async () => {
      const f = await fixture();
      await f.repo.answer(f.answer);
      const support = await f.repo.getActiveSupport({ scope: f.scope });
      const request = { scope: f.scope, supportId: support!.id };
      expect(
        await Promise.all([
          f.repo.recordExposure({ ...request, kind: 'DISPLAY' }),
          f.repo.recordExposure({ ...request, kind: 'DETAILS' }),
        ]),
      ).toEqual([true, true]);
      const stored = await client.socialActivitySupportIntervention.findUniqueOrThrow({
        where: { id: support!.id },
      });
      expect(stored).toMatchObject({
        status: 'OFFERED',
        firstDisplayedAt: now,
        firstDetailsViewedAt: now,
      });
      expect((stored.definitionSnapshot as { exposureTracking: string }).exposureTracking).toBe(
        'social-support-exposure-v1',
      );
      await client.groupMembership.update({
        where: { id: f.scope.groupMembershipId },
        data: { serviceRole: 'SERVICE_OWNER' },
      });
      const observationScope = {
        tenantRef: f.scope.workspaceId,
        workspaceId: f.scope.workspaceId,
        serviceId: f.scope.serviceId,
        packageKey: 'SOCIAL',
        adapterKey: 'HASSY_SUPPORT_OUTCOMES',
        environment: 'DEVELOPMENT' as const,
      };
      const observer = new PrismaHassySupportImprovementAdapter(client, observationScope);
      const observed = await observer.readPairedObservations({
        actorUserId: f.scope.userId,
        scope: observationScope,
        fromInclusive: at,
        toExclusive: new Date('2026-11-04T00:00:00Z'),
        limit: 100,
        subject: null,
      });
      expect(observed.exposure.observations[0]?.metadata).toEqual({
        displayedByCutoff: true,
        detailsViewedByCutoff: true,
        uncertain: false,
        pattern: 'P3',
      });
      expect(observed.outcomes.observations[0]?.metadata['acceptedByCutoff']).toBe(false);
      const later = new PrismaSocialActivityBarrierConfirmationRepository(
        client,
        () => new Date(now.getTime() + 60_000),
      );
      expect(await later.recordExposure({ ...request, kind: 'DETAILS' })).toBe(true);
      expect(
        await client.socialActivitySupportIntervention.findUniqueOrThrow({
          where: { id: support!.id },
        }),
      ).toMatchObject({ firstDisplayedAt: now, firstDetailsViewedAt: now, acceptedAt: null });
    });
    it('handles details arriving first and denies foreign scopes or stopped features without writing', async () => {
      const f = await fixture();
      const other = await fixture();
      await f.repo.answer(f.answer);
      const support = await f.repo.getActiveSupport({ scope: f.scope });
      expect(
        await f.repo.recordExposure({
          scope: other.scope,
          supportId: support!.id,
          kind: 'DETAILS',
        }),
      ).toBe(false);
      expect(
        await f.repo.recordExposure({ scope: f.scope, supportId: support!.id, kind: 'DETAILS' }),
      ).toBe(true);
      await f.stop();
      expect(
        await f.repo.recordExposure({ scope: f.scope, supportId: support!.id, kind: 'DISPLAY' }),
      ).toBe(false);
      expect(
        await client.socialActivitySupportIntervention.findUniqueOrThrow({
          where: { id: support!.id },
        }),
      ).toMatchObject({ firstDisplayedAt: now, firstDetailsViewedAt: now, status: 'OFFERED' });
    });
    it('compares fixed behavior windows through real scoped queries and rejects revoked managers', async () => {
      const f = await fixture();
      await client.groupMembership.update({
        where: { id: f.scope.groupMembershipId },
        data: { serviceRole: 'SERVICE_OWNER' },
      });
      await f.repo.answer(f.answer);
      const support = await f.repo.getActiveSupport({ scope: f.scope });
      await f.repo.transitionSupport({
        scope: f.scope,
        supportId: support!.id,
        action: 'ACCEPT',
        occurredAt: now,
      });
      await client.socialActivitySupportIntervention.update({
        where: { id: support!.id },
        data: { updatedAt: now },
      });
      const actionAt = new Date('2026-11-04T00:00:00Z');
      const mission = await client.dailyMission.create({
        data: {
          workspaceId: f.scope.workspaceId,
          bunshinId: f.scope.bunshinId,
          missionDate: actionAt,
          format: 'TEXT',
          estimatedMinutes: 5,
          topic: 'PRIVATE_SYNTHETIC',
          angle: 'Synthetic',
          reason: 'Synthetic',
          createdAt: actionAt,
        },
      });
      await client.missionDecision.create({
        data: {
          workspaceId: f.scope.workspaceId,
          bunshinId: f.scope.bunshinId,
          dailyMissionId: mission.id,
          decision: 'ACCEPTED',
          decidedAt: actionAt,
          updatedAt: actionAt,
        },
      });
      await client.postRecord.create({
        data: {
          workspaceId: f.scope.workspaceId,
          bunshinId: f.scope.bunshinId,
          dailyMissionId: mission.id,
          actorUserId: f.scope.userId,
          platform: 'INSTAGRAM',
          postedAt: actionAt,
          createdAt: actionAt,
          idempotencyKey: randomUUID(),
        },
      });
      const scope = {
        tenantRef: f.scope.workspaceId,
        workspaceId: f.scope.workspaceId,
        serviceId: f.scope.serviceId,
        packageKey: 'SOCIAL',
        adapterKey: 'SOCIAL_SUPPORT_BEHAVIOR',
        environment: 'DEVELOPMENT' as const,
      };
      const reader = new PrismaSocialSupportBehaviorAdapter(
        client,
        scope,
        () => new Date('2026-11-12T00:00:00Z'),
      );
      const request = {
        scope,
        actorUserId: f.scope.userId,
        fromInclusive: now,
        toExclusive: new Date('2026-11-04T00:00:00Z'),
        limit: 100,
        subject: null,
      };
      const result = await reader.readObservations(request);
      expect(result.observations[0]?.metadata).toEqual({
        beforeAccepted: false,
        afterAccepted: true,
        beforePosted: false,
        afterPosted: true,
        uncertain: false,
        pattern: 'P10',
      });
      expect(JSON.stringify(result)).not.toContain('PRIVATE_SYNTHETIC');
      await client.groupMembership.update({
        where: { id: f.scope.groupMembershipId },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await expect(reader.readObservations(request)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('offers one support, suppresses new questions and replays only the same answer', async () => {
      const f = await fixture();
      expect(await f.repo.getPendingQuestion({ scope: f.scope })).not.toBeNull();
      const first = await f.repo.answer(f.answer);
      expect(first?.support?.key).toBe('FIVE_MINUTE_ACTION');
      expect(await f.repo.answer(f.answer)).toEqual(first);
      expect(await f.repo.answer({ ...f.answer, selectedCaseId: null })).toBeNull();
      await f.addCase('HOW_TO');
      expect(await f.repo.getPendingQuestion({ scope: f.scope })).toBeNull();
      expect(
        await client.socialActivitySupportIntervention.count({ where: { caseId: f.row.id } }),
      ).toBe(1);
    });
    it('serializes concurrent answers and preserves one frozen intervention', async () => {
      const f = await fixture();
      const values = await Promise.all([f.repo.answer(f.answer), f.repo.answer(f.answer)]);
      expect(values[0]).not.toBeNull();
      expect(values[1]).toEqual(values[0]);
      expect(
        await client.socialActivityBarrierConfirmation.count({ where: { caseId: f.row.id } }),
      ).toBe(1);
    });
    it('feature stop hides questions and blocks new answers or acceptance', async () => {
      const f = await fixture();
      await f.stop();
      expect(await f.repo.getPendingQuestion({ scope: f.scope })).toBeNull();
      expect(await f.repo.answer(f.answer)).toBeNull();
      expect(
        await client.socialActivityBarrierConfirmation.count({ where: { caseId: f.row.id } }),
      ).toBe(0);
    });
    it.each(['user', 'member', 'capability', 'consent', 'assignment', 'expiry'] as const)(
      'rejects inactive or unauthorized %s',
      async (kind) => {
        const f = await fixture();
        if (kind === 'user')
          await client.user.update({
            where: { id: f.scope.userId },
            data: { status: 'SUSPENDED' },
          });
        if (kind === 'member')
          await client.groupMembership.update({
            where: { id: f.scope.groupMembershipId },
            data: { status: 'SUSPENDED' },
          });
        if (kind === 'capability')
          await client.bunshinCapabilityAssignment.updateMany({
            where: { bunshinId: f.scope.bunshinId },
            data: { status: 'SUSPENDED' },
          });
        if (kind === 'consent')
          await client.groupMembership.update({
            where: { id: f.scope.groupMembershipId },
            data: { consentedAt: new Date(now.getTime() + 86_400_000) },
          });
        if (kind === 'assignment')
          await client.groupMemberFeatureAssignment.updateMany({
            where: { groupMembershipId: f.scope.groupMembershipId },
            data: { status: 'DISABLED' },
          });
        if (kind === 'expiry')
          await client.groupFeaturePolicy.updateMany({
            where: { groupId: f.scope.serviceId },
            data: { endsAt: at },
          });
        expect(await f.repo.answer(f.answer)).toBeNull();
        expect(await f.repo.getPendingQuestion({ scope: f.scope })).toBeNull();
      },
    );
    it('rejects another OEM and Bunshin even for a known receipt or support id', async () => {
      const f = await fixture();
      const other = await fixture();
      await f.repo.answer(f.answer);
      const progress = await f.repo.getActiveSupport({ scope: f.scope });
      expect(progress).not.toBeNull();
      expect(await f.repo.answer({ ...f.answer, scope: other.scope })).toBeNull();
      expect(
        await f.repo.transitionSupport({
          scope: other.scope,
          supportId: progress!.id,
          action: 'ACCEPT',
          occurredAt: now,
        }),
      ).toBeNull();
      expect(
        await f.repo.getActiveSupport({ scope: { ...f.scope, bunshinId: other.scope.bunshinId } }),
      ).toBeNull();
    });
    it('stores decline reason and a 30-day cooldown atomically; retries do not change the reason', async () => {
      const f = await fixture();
      await f.repo.answer(f.answer);
      const progress = await f.repo.getActiveSupport({ scope: f.scope });
      const command = {
        scope: f.scope,
        supportId: progress!.id,
        action: 'SKIP' as const,
        occurredAt: now,
        reason: '投稿はすでに済んでいます',
      };
      expect((await f.repo.transitionSupport(command))?.status).toBe('SKIPPED');
      expect((await f.repo.transitionSupport(command))?.status).toBe('SKIPPED');
      expect(await f.repo.transitionSupport({ ...command, reason: 'Different reason' })).toBeNull();
      const row = await client.socialActivityBarrierCase.findUniqueOrThrow({
        where: { id: f.row.id },
      });
      expect(row.status).toBe('DISMISSED');
      expect(row.nextEligibleAt?.getTime()).toBe(now.getTime() + 30 * 86_400_000);
      const stored = await client.socialActivitySupportIntervention.findUniqueOrThrow({
        where: { id: progress!.id },
      });
      expect(stored.definitionSnapshot).toMatchObject({ feedback: { reason: command.reason } });
      expect(await f.repo.getActiveSupport({ scope: f.scope })).toBeNull();
    });
    it('after stop refuses acceptance but retains the owner ability to record completion', async () => {
      const f = await fixture();
      await f.repo.answer(f.answer);
      const progress = await f.repo.getActiveSupport({ scope: f.scope });
      await f.stop();
      expect(
        await f.repo.transitionSupport({
          scope: f.scope,
          supportId: progress!.id,
          action: 'ACCEPT',
          occurredAt: now,
        }),
      ).toBeNull();
      expect(
        (
          await f.repo.transitionSupport({
            scope: f.scope,
            supportId: progress!.id,
            action: 'COMPLETE',
            occurredAt: now,
          })
        )?.status,
      ).toBe('COMPLETED');
    });
    it('legacy receipts are not guessed and cannot be used to replace frozen support', async () => {
      const f = await fixture();
      await f.repo.answer(f.answer);
      await client.$executeRaw`UPDATE social_activity_barrier_confirmations SET request_snapshot=NULL WHERE case_id=${f.row.id}::uuid`;
      expect(await f.repo.answer(f.answer)).toBeNull();
      expect(await f.repo.getActiveSupport({ scope: f.scope })).not.toBeNull();
    });
  });
}
