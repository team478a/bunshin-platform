import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaSocialAccountConnections } from '../src/social-account-connections';
import { PrismaSocialPublicationIntents } from '../src/social-publication-intents';

/** Registered inside database.integration.test.ts, after its disposable DB preflight. */
export function registerSocialPublicationIntentIntegrationCases(client: PrismaClient) {
  describe('social publication approval and execution boundary', () => {
    const workspaces: string[] = [];
    const users: string[] = [];

    afterEach(async () => {
      await client.postRecord.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.socialPublicationIntent.deleteMany({
        where: { workspaceId: { in: workspaces } },
      });
      await client.job.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.socialImageGeneratedMedia.deleteMany({
        where: { workspaceId: { in: workspaces } },
      });
      await client.socialImageGenerationRequest.deleteMany({
        where: { workspaceId: { in: workspaces } },
      });
      await client.socialImagePilotEnrollment.deleteMany({
        where: { workspaceId: { in: workspaces } },
      });
      await client.socialImageGenerationPilot.deleteMany({
        where: { workspaceId: { in: workspaces } },
      });
      await client.missionContentVariantSelection.deleteMany({
        where: { workspaceId: { in: workspaces } },
      });
      await client.missionContentVariant.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.dailyMission.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.socialProfile.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.socialAccountConnectionGrant.deleteMany({
        where: { workspaceId: { in: workspaces } },
      });
      await client.socialAccountConnection.deleteMany({
        where: { workspaceId: { in: workspaces } },
      });
      await client.bunshinCapabilityAssignment.deleteMany({
        where: { workspaceId: { in: workspaces } },
      });
      await client.groupMemberFeatureAssignment.deleteMany({
        where: { workspaceId: { in: workspaces } },
      });
      await client.groupFeaturePolicy.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.serviceConfiguration.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.bunshin.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.groupMembership.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.group.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.workspace.deleteMany({ where: { id: { in: workspaces } } });
      await client.user.deleteMany({ where: { id: { in: users } } });
      workspaces.length = 0;
      users.length = 0;
    });

    async function fixture() {
      const user = await client.user.create({ data: { displayName: 'Publication owner' } });
      users.push(user.id);
      const workspace = await client.workspace.create({
        data: { name: 'Publication', type: 'ORGANIZATION' },
      });
      workspaces.push(workspace.id);
      await client.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: user.id, role: 'MEMBER', status: 'ACTIVE' },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Publication service' },
      });
      await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: `publication-${randomUUID()}`,
          displayName: 'Publication',
          description: 'test',
          operatorName: 'test',
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
          consentedAt: new Date(Date.now() - 60_000),
        },
      });
      await client.featureDefinition.upsert({
        where: { key: 'SOCIAL' },
        create: { key: 'SOCIAL', name: 'SOCIAL', description: 'SOCIAL' },
        update: { status: 'ACTIVE' },
      });
      await client.groupFeaturePolicy.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          featureKey: 'SOCIAL',
          status: 'ENABLED',
          setByUserId: user.id,
        },
      });
      await client.groupMemberFeatureAssignment.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          groupMembershipId: membership.id,
          featureKey: 'SOCIAL',
          status: 'ENABLED',
          assignedByUserId: user.id,
        },
      });
      const bunshin = await client.bunshin.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          ownerUserId: user.id,
          name: 'Publisher',
          slug: `publisher-${randomUUID()}`,
          type: 'COPY',
          status: 'ACTIVE',
          objectiveSummary: 'publish',
          audienceSummary: 'audience',
          personalitySummary: 'personality',
        },
      });
      await client.bunshinCapabilityAssignment.create({
        data: {
          workspaceId: workspace.id,
          bunshinId: bunshin.id,
          capabilityType: 'SOCIAL',
          status: 'ACTIVE',
          assignedByUserId: user.id,
        },
      });
      const profile = await client.socialProfile.create({
        data: {
          workspaceId: workspace.id,
          bunshinId: bunshin.id,
          platform: 'INSTAGRAM',
          purpose: 'test',
          postingFrequency: 'WEEKLY',
          preferredFormats: ['IMAGE'],
          status: 'ACTIVE',
        },
      });
      const mission = await client.dailyMission.create({
        data: {
          workspaceId: workspace.id,
          bunshinId: bunshin.id,
          socialProfileId: profile.id,
          missionDate: new Date('2026-11-04'),
          format: 'IMAGE',
          assistanceLevel: 'READY_TO_USE',
          estimatedMinutes: 5,
          topic: 'topic',
          angle: 'angle',
          reason: 'reason',
        },
      });
      const variant = await client.missionContentVariant.create({
        data: {
          workspaceId: workspace.id,
          bunshinId: bunshin.id,
          dailyMissionId: mission.id,
          actorUserId: user.id,
          sequence: 1,
          format: 'IMAGE',
          contentJson: { caption: 'approved caption' },
          qualityScore: 100,
          model: 'test',
          promptVersion: 'test-v1',
          latencyMs: 1,
        },
      });
      await client.missionContentVariantSelection.create({
        data: {
          workspaceId: workspace.id,
          bunshinId: bunshin.id,
          dailyMissionId: mission.id,
          variantId: variant.id,
          actorUserId: user.id,
          idempotencyKey: randomUUID(),
        },
      });
      const pilot = await client.socialImageGenerationPilot.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          version: 1,
          status: 'ACTIVE',
          dailyLimit: 10,
          monthlyLimit: 100,
          memberMonthlyLimit: 20,
          defaultModel: 'test',
          defaultQuality: 'standard',
          changeReason: 'test',
          createdByUserId: user.id,
          updatedByUserId: user.id,
        },
      });
      const enrollment = await client.socialImagePilotEnrollment.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          pilotId: pilot.id,
          groupMembershipId: membership.id,
          status: 'ACTIVE',
          consentedAt: new Date(),
        },
      });
      const imageRequest = await client.socialImageGenerationRequest.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          groupMembershipId: membership.id,
          ownerUserId: user.id,
          bunshinId: bunshin.id,
          dailyMissionId: mission.id,
          pilotEnrollmentId: enrollment.id,
          status: 'READY_FOR_REVIEW',
          templateKey: 'PERSON_HEADLINE',
          layout: {},
          idempotencyKey: randomUUID(),
        },
      });
      const media = await client.socialImageGeneratedMedia.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          ownerUserId: user.id,
          dailyMissionId: mission.id,
          requestId: imageRequest.id,
          status: 'READY',
          completedStorageKey: `${workspace.id}/${group.id}/${user.id}/${imageRequest.id}/${randomUUID()}/completed.png`,
          thumbnailStorageKey: `${workspace.id}/${group.id}/${user.id}/${imageRequest.id}/${randomUUID()}/thumbnail.png`,
          width: 1080,
          height: 1350,
          contentHash: 'a'.repeat(64),
        },
      });
      const owner = {
        workspaceId: workspace.id,
        serviceId: group.id,
        groupMembershipId: membership.id,
        userId: user.id,
        bunshinId: bunshin.id,
      };
      const connection = await new PrismaSocialAccountConnections(client, {
        seal: () => 'sealed-token',
        open: () => 'private-token',
      }).save(user.id, owner, {
        platform: 'INSTAGRAM',
        externalAccountId: '17841400000000000',
        displayName: 'test.account',
        scopes: ['instagram_business_basic', 'instagram_business_content_publish'],
        accessToken: 'private-token',
        tokenExpiresAt: new Date(Date.now() + 86_400_000),
      });
      return {
        user,
        workspace,
        group,
        membership,
        bunshin,
        profile,
        mission,
        variant,
        media,
        owner,
        connection,
        repository: new PrismaSocialPublicationIntents(client),
      };
    }

    it('persists one approval/job, rechecks mutable rights, and never retries UNKNOWN', async () => {
      const f = await fixture();
      const input = {
        ...f.owner,
        actorUserId: f.user.id,
        socialProfileId: f.profile.id,
        dailyMissionId: f.mission.id,
        contentVariantId: f.variant.id,
        connectionId: f.connection.id,
        mediaId: f.media.id,
        caption: 'approved caption',
        scheduledAt: new Date(Date.now() + 30_000),
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        environment: 'DEVELOPMENT' as const,
      };
      const approved = await f.repository.approve(input);
      expect(await f.repository.approve(input)).toEqual(approved);
      expect(await client.socialPublicationIntent.count({ where: { id: approved.id } })).toBe(1);
      expect(
        await client.job.count({
          where: { payloadReference: `social-publication:${approved.id}` },
        }),
      ).toBe(1);
      expect(JSON.stringify(approved)).not.toContain('private-token');

      await client.socialImageGeneratedMedia.update({
        where: { id: f.media.id },
        data: { contentHash: 'b'.repeat(64) },
      });
      await expect(
        f.repository.claim({
          workspaceId: f.workspace.id,
          intentId: approved.id,
          actorUserId: f.user.id,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await client.socialImageGeneratedMedia.update({
        where: { id: f.media.id },
        data: { contentHash: 'a'.repeat(64) },
      });
      const claimed = await f.repository.claim({
        workspaceId: f.workspace.id,
        intentId: approved.id,
        actorUserId: f.user.id,
      });
      expect(claimed.terminal).toBe(false);
      await f.repository.recordContainer(approved.id, '123456789');
      await f.repository.beginAmbiguousPublish(approved.id, '123456789');
      await expect(
        f.repository.claim({
          workspaceId: f.workspace.id,
          intentId: approved.id,
          actorUserId: f.user.id,
        }),
      ).resolves.toEqual({ terminal: true, status: 'UNKNOWN' });
      await expect(
        f.repository.getUnknownForReconciliation(f.user.id, f.owner, approved.id),
      ).resolves.toMatchObject({ containerId: '123456789' });
      await expect(f.repository.recordReconciliation(approved.id, 'PUBLISHED')).resolves.toEqual({
        status: 'UNKNOWN',
        containerStatus: 'PUBLISHED',
      });
      await f.repository.complete(approved.id, '987654321');
      expect(
        await client.postRecord.findUniqueOrThrow({ where: { dailyMissionId: f.mission.id } }),
      ).toMatchObject({ source: 'OFFICIAL_API', externalPostId: '987654321' });
    });

    it('rejects another user and capability revocation at execution time', async () => {
      const f = await fixture();
      const input = {
        ...f.owner,
        actorUserId: f.user.id,
        socialProfileId: f.profile.id,
        dailyMissionId: f.mission.id,
        contentVariantId: f.variant.id,
        connectionId: f.connection.id,
        mediaId: f.media.id,
        caption: 'approved caption',
        scheduledAt: new Date(Date.now() + 30_000),
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        environment: 'DEVELOPMENT' as const,
      };
      const approved = await f.repository.approve(input);
      await expect(
        f.repository.claim({
          workspaceId: f.workspace.id,
          intentId: approved.id,
          actorUserId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await client.bunshinCapabilityAssignment.updateMany({
        where: { bunshinId: f.bunshin.id, capabilityType: 'SOCIAL' },
        data: { status: 'SUSPENDED' },
      });
      await expect(
        f.repository.claim({
          workspaceId: f.workspace.id,
          intentId: approved.id,
          actorUserId: f.user.id,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
}
