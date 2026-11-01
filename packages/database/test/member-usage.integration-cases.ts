import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { GetMemberUsageSummary, type MemberUsageRequest } from '@bunshin/application';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaMemberUsageRepository } from '../src/member-usage-repository';

const at = new Date('2026-10-31T15:00:00Z');
const now = new Date('2026-11-02T00:00:00Z');

/** Registered inside database.integration.test.ts, after its disposable DB preflight. */
export function registerMemberUsageIntegrationCases(client: PrismaClient) {
  describe('member usage PostgreSQL ownership and projection', () => {
    const workspaceIds: string[] = [];
    const userIds: string[] = [];
    afterEach(async () => {
      const where = { workspaceId: { in: workspaceIds } };
      await client.aiUsageEvent.deleteMany({ where });
      await client.dailyMissionGeneration.deleteMany({ where });
      await client.missionContentVariantSelection.deleteMany({ where });
      await client.missionContentVariantGeneration.deleteMany({ where });
      await client.missionContentVariant.deleteMany({ where });
      await client.missionActivity.deleteMany({ where });
      await client.missionDecision.deleteMany({ where });
      await client.postRecord.deleteMany({ where });
      await client.dailyMission.deleteMany({ where });
      await client.bunshin.deleteMany({ where });
      await client.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await client.user.deleteMany({ where: { id: { in: userIds } } });
      workspaceIds.length = 0;
      userIds.length = 0;
    });

    async function fixture() {
      const user = await client.user.create({ data: { displayName: 'Synthetic usage owner' } });
      userIds.push(user.id);
      const workspace = await client.workspace.create({
        data: { name: 'Synthetic usage', type: 'ORGANIZATION' },
      });
      workspaceIds.push(workspace.id);
      await client.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: user.id, role: 'MEMBER', status: 'ACTIVE' },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Synthetic usage' },
      });
      const configuration = await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: `usage-${randomUUID()}`,
          displayName: 'Synthetic',
          description: 'Synthetic',
          operatorName: 'Synthetic',
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
          consentedAt: at,
        },
      });
      const bunshin = await makeBunshin(workspace.id, group.id, user.id);
      const request: MemberUsageRequest = {
        actorUserId: user.id,
        scope: {
          workspaceId: workspace.id,
          serviceId: group.id,
          groupMembershipId: membership.id,
          userId: user.id,
          bunshinId: bunshin.id,
        },
        asOf: new Date('2026-11-01T03:00:00Z'),
        timezone: 'Asia/Tokyo',
      };
      const repository = new PrismaMemberUsageRepository(client, () => now);
      return {
        user,
        workspace,
        group,
        configuration,
        membership,
        bunshin,
        request,
        repository,
        summary: () => new GetMemberUsageSummary(repository, repository).execute(request),
      };
    }

    function makeBunshin(workspaceId: string, groupId: string, ownerUserId: string) {
      return client.bunshin.create({
        data: {
          workspaceId,
          groupId,
          ownerUserId,
          slug: `usage-${randomUUID()}`,
          name: 'Synthetic',
          type: 'COPY',
          status: 'ACTIVE',
          objectiveSummary: 'Synthetic',
          audienceSummary: 'Synthetic',
          personalitySummary: 'Synthetic',
        },
      });
    }
    function mission(workspaceId: string, bunshinId: string) {
      return client.dailyMission.create({
        data: {
          workspaceId,
          bunshinId,
          missionDate: at,
          format: 'TEXT',
          estimatedMinutes: 5,
          topic: 'DO_NOT_READ_TOPIC',
          angle: 'Synthetic',
          reason: 'Synthetic',
          createdAt: at,
        },
      });
    }

    it('reads actual existing sources, preserves unknown cost and never writes usage or membership', async () => {
      const f = await fixture();
      const m = await mission(f.workspace.id, f.bunshin.id);
      const owned = {
        workspaceId: f.workspace.id,
        bunshinId: f.bunshin.id,
        actorUserId: f.user.id,
      };
      await client.dailyMissionGeneration.create({
        data: {
          ...owned,
          missionDate: at,
          dailyMissionId: m.id,
          status: 'COMPLETED',
          idempotencyKey: randomUUID(),
          createdAt: at,
          updatedAt: at,
        },
      });
      const variant = await client.missionContentVariant.create({
        data: {
          ...owned,
          dailyMissionId: m.id,
          sequence: 1,
          format: 'TEXT',
          contentJson: { private: 'DO_NOT_READ_CONTENT' },
          qualityScore: 90,
          model: 'synthetic',
          promptVersion: 'synthetic',
          latencyMs: 1,
          createdAt: at,
        },
      });
      await client.missionContentVariantSelection.create({
        data: {
          ...owned,
          dailyMissionId: m.id,
          variantId: variant.id,
          idempotencyKey: randomUUID(),
          selectedAt: at,
        },
      });
      await client.missionActivity.createMany({
        data: ['ACCEPTED', 'POSTED', 'VIEWED'].map((type) => ({
          ...owned,
          dailyMissionId: m.id,
          type: type as 'ACCEPTED' | 'POSTED' | 'VIEWED',
          occurredAt: at,
          idempotencyKey: randomUUID(),
          metadata: { private: 'DO_NOT_READ_METADATA' },
        })),
      });
      await client.missionDecision.create({
        data: {
          workspaceId: f.workspace.id,
          bunshinId: f.bunshin.id,
          dailyMissionId: m.id,
          decision: 'ACCEPTED',
          decidedAt: at,
        },
      });
      await client.postRecord.create({
        data: {
          ...owned,
          dailyMissionId: m.id,
          platform: 'INSTAGRAM',
          postedAt: new Date('2026-10-01Z'),
          createdAt: at,
          idempotencyKey: randomUUID(),
          postUrl: 'https://example.com/DO_NOT_READ_URL',
          manualMetrics: { private: 'DO_NOT_READ_METRICS' },
        },
      });
      for (const status of ['SUCCESS', 'FAILED'] as const)
        await client.aiUsageEvent.create({
          data: {
            ...owned,
            taskType: 'SYNTHETIC',
            provider: 'synthetic',
            model: 'synthetic',
            promptVersion: 'synthetic',
            status,
            latencyMs: 1,
            estimatedCostUsdMicros: status === 'SUCCESS' ? 13n : null,
            idempotencyKey: randomUUID(),
            occurredAt: at,
          },
        });
      const before = await client.groupMembership.findUniqueOrThrow({
        where: { id: f.membership.id },
        select: { updatedAt: true, lastUsedAt: true },
      });
      const sources = await f.repository.read(f.request);
      expect(
        JSON.stringify(sources, (_, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ).not.toContain('DO_NOT_READ');
      const result = await f.summary();
      expect(result.last7Days).toMatchObject({
        generated: 2,
        unknownTriggerGenerations: 2,
        accepted: 1,
        selfReportedPosts: 1,
        activeDays: 1,
        aiCost: { knownUsdMicros: '13', unknownEvents: 1 },
      });
      expect(
        await client.groupMembership.findUniqueOrThrow({
          where: { id: f.membership.id },
          select: { updatedAt: true, lastUsedAt: true },
        }),
      ).toEqual(before);
      expect(await client.missionActivity.count({ where: owned })).toBe(3);
      expect(await client.aiUsageEvent.count({ where: owned })).toBe(2);
    });

    it('keeps the same user Bunshins and services separate, including claims without a Mission FK', async () => {
      const f = await fixture();
      const other = await makeBunshin(f.workspace.id, f.group.id, f.user.id);
      const m = await mission(f.workspace.id, other.id);
      const owned = { workspaceId: f.workspace.id, bunshinId: other.id, actorUserId: f.user.id };
      await client.missionActivity.create({
        data: {
          ...owned,
          dailyMissionId: m.id,
          type: 'ACCEPTED',
          occurredAt: at,
          idempotencyKey: randomUUID(),
        },
      });
      // A malformed old claim pointing at another Bunshin is not valid generation evidence.
      await client.dailyMissionGeneration.create({
        data: {
          ...owned,
          bunshinId: f.bunshin.id,
          missionDate: at,
          dailyMissionId: m.id,
          status: 'COMPLETED',
          idempotencyKey: randomUUID(),
          updatedAt: at,
        },
      });
      expect((await f.summary()).allTime).toMatchObject({
        generated: 0,
        accepted: 0,
        activeDays: 0,
      });
      const ownOther = { ...f.request, scope: { ...f.request.scope, bunshinId: other.id } };
      expect(
        (await new GetMemberUsageSummary(f.repository, f.repository).execute(ownOther)).allTime
          .accepted,
      ).toBe(1);
      const otherGroup = await client.group.create({
        data: { workspaceId: f.workspace.id, name: 'Other service' },
      });
      await client.groupMembership.create({
        data: {
          workspaceId: f.workspace.id,
          groupId: otherGroup.id,
          userId: f.user.id,
          status: 'ACTIVE',
          consentedAt: at,
        },
      });
      const serviceBunshin = await makeBunshin(f.workspace.id, otherGroup.id, f.user.id);
      expect(
        await f.repository.read({
          ...f.request,
          scope: { ...f.request.scope, bunshinId: serviceBunshin.id },
        }),
      ).toBeNull();
    });

    it('rejects other users and OEM scopes and excludes another actor even on the same Mission', async () => {
      const f = await fixture();
      const foreign = await fixture();
      expect(
        await f.repository.read({ ...f.request, scope: { ...foreign.request.scope } }),
      ).toBeNull();
      expect(
        await f.repository.read({
          ...f.request,
          scope: {
            ...f.request.scope,
            workspaceId: foreign.workspace.id,
            serviceId: foreign.group.id,
          },
        }),
      ).toBeNull();
      const stranger = await client.user.create({ data: { displayName: 'Synthetic other' } });
      userIds.push(stranger.id);
      await client.workspaceMembership.create({
        data: { workspaceId: f.workspace.id, userId: stranger.id, role: 'ADMIN', status: 'ACTIVE' },
      });
      const strangerMembership = await client.groupMembership.create({
        data: {
          workspaceId: f.workspace.id,
          groupId: f.group.id,
          userId: stranger.id,
          status: 'ACTIVE',
          consentedAt: at,
          serviceRole: 'SERVICE_ADMIN',
        },
      });
      const m = await mission(f.workspace.id, f.bunshin.id);
      await client.missionActivity.create({
        data: {
          workspaceId: f.workspace.id,
          bunshinId: f.bunshin.id,
          actorUserId: stranger.id,
          dailyMissionId: m.id,
          type: 'ACCEPTED',
          occurredAt: at,
          idempotencyKey: randomUUID(),
        },
      });
      await client.aiUsageEvent.create({
        data: {
          workspaceId: f.workspace.id,
          bunshinId: f.bunshin.id,
          actorUserId: stranger.id,
          taskType: 'SYNTHETIC',
          provider: 'synthetic',
          model: 'synthetic',
          promptVersion: 'synthetic',
          status: 'SUCCESS',
          latencyMs: 1,
          estimatedCostUsdMicros: 99n,
          idempotencyKey: randomUUID(),
          occurredAt: at,
        },
      });
      expect((await f.summary()).allTime).toMatchObject({
        accepted: 0,
        aiCost: { knownUsdMicros: '0', unknownEvents: 0 },
      });
      const strangerRequest = {
        ...f.request,
        actorUserId: stranger.id,
        scope: {
          ...f.request.scope,
          userId: stranger.id,
          groupMembershipId: strangerMembership.id,
        },
      };
      expect(await f.repository.read(strangerRequest)).toBeNull();
    });

    it('rechecks a revoked membership after an earlier successful authorization', async () => {
      const f = await fixture();
      expect(await f.repository.authorize(f.request)).toBe(true);
      await client.groupMembership.update({
        where: { id: f.membership.id },
        data: { status: 'REVOKED', revokedAt: now },
      });
      expect(await f.repository.read(f.request)).toBeNull();
    });

    it.each([
      'user',
      'workspace',
      'workspaceMembership',
      'group',
      'consent',
      'bunshin',
      'serviceExpired',
      'serviceFuture',
    ] as const)('denies current %s restrictions despite historical asOf', async (kind) => {
      const f = await fixture();
      if (kind === 'user')
        await client.user.update({ where: { id: f.user.id }, data: { status: 'SUSPENDED' } });
      if (kind === 'workspace')
        await client.workspace.update({
          where: { id: f.workspace.id },
          data: { status: 'SUSPENDED' },
        });
      if (kind === 'workspaceMembership')
        await client.workspaceMembership.updateMany({
          where: { workspaceId: f.workspace.id, userId: f.user.id },
          data: { status: 'REVOKED' },
        });
      if (kind === 'group')
        await client.group.update({ where: { id: f.group.id }, data: { status: 'SUSPENDED' } });
      if (kind === 'consent')
        await client.groupMembership.update({
          where: { id: f.membership.id },
          data: { status: 'INVITED', consentedAt: null },
        });
      if (kind === 'bunshin')
        await client.bunshin.update({ where: { id: f.bunshin.id }, data: { status: 'ARCHIVED' } });
      if (kind === 'serviceExpired')
        await client.serviceConfiguration.update({
          where: { id: f.configuration.id },
          data: { endsAt: now },
        });
      if (kind === 'serviceFuture')
        await client.serviceConfiguration.update({
          where: { id: f.configuration.id },
          data: { startsAt: new Date('2026-11-03Z') },
        });
      await expect(f.summary()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('requires latest effective legal consent and excludes a not-yet-effective newer version', async () => {
      const f = await fixture();
      const data = {
        workspaceId: f.workspace.id,
        groupId: f.group.id,
        configurationId: f.configuration.id,
        type: 'TERMS' as const,
        title: 'Synthetic',
        content: 'Synthetic',
        status: 'PUBLISHED' as const,
        createdByUserId: f.user.id,
      };
      const old = await client.serviceLegalDocument.create({
        data: { ...data, version: 1, effectiveAt: at },
      });
      const current = await client.serviceLegalDocument.create({
        data: { ...data, version: 2, effectiveAt: at },
      });
      await client.serviceLegalDocument.create({
        data: { ...data, version: 3, effectiveAt: new Date('2026-11-03Z') },
      });
      const consent = {
        workspaceId: f.workspace.id,
        groupId: f.group.id,
        groupMembershipId: f.membership.id,
        userId: f.user.id,
        consentedAt: at,
      };
      await client.serviceLegalConsent.create({ data: { ...consent, legalDocumentId: old.id } });
      expect(await f.repository.read(f.request)).toBeNull();
      await client.serviceLegalConsent.create({
        data: { ...consent, legalDocumentId: current.id },
      });
      expect((await f.summary()).allTime.activeDays).toBe(0);
    });

    it('excludes failed and future variants while supporting old saved variants', async () => {
      const f = await fixture();
      const m = await mission(f.workspace.id, f.bunshin.id);
      const owned = {
        workspaceId: f.workspace.id,
        bunshinId: f.bunshin.id,
        actorUserId: f.user.id,
      };
      for (const [index, status] of (['SUCCEEDED', 'FAILED', null] as const).entries()) {
        const variant = await client.missionContentVariant.create({
          data: {
            ...owned,
            dailyMissionId: m.id,
            sequence: index + 1,
            format: 'TEXT',
            contentJson: {},
            qualityScore: 90,
            model: 'synthetic',
            promptVersion: 'synthetic',
            latencyMs: 1,
            createdAt: at,
          },
        });
        if (status)
          await client.missionContentVariantGeneration.create({
            data: {
              ...owned,
              dailyMissionId: m.id,
              variantId: variant.id,
              status,
              initiatingSource: 'PHOTO_FIRST',
              idempotencyKey: randomUUID(),
              updatedAt: status === 'SUCCEEDED' ? new Date('2026-11-03Z') : at,
            },
          });
      }
      expect((await f.summary()).allTime).toMatchObject({
        generated: 1,
        unknownTriggerGenerations: 1,
        activeDays: 0,
      });
    });
  });
}
