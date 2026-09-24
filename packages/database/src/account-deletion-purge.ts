import type { AccountDeletionPurgeRepository } from '@bunshin/application';
import { purgeAccountMedia, type AccountDeletionMediaStorage } from './account-deletion-media';
import { Prisma, type PrismaClient, prisma } from './client';

export class PrismaAccountDeletionPurgeRepository implements AccountDeletionPurgeRepository {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly mediaStorage?: AccountDeletionMediaStorage,
  ) {}

  async completeAfterAuthDeletion(
    input: Parameters<AccountDeletionPurgeRepository['completeAfterAuthDeletion']>[0],
  ) {
    const media = await purgeAccountMedia(this.client, input, this.mediaStorage);
    if (media === false) return null;
    if (media === 'PENDING')
      return {
        requestId: input.requestId,
        userId: input.userId,
        status: 'PROCESSING' as const,
        blockedReason: null,
      };
    // Storage can take time; validate the completion lease against a fresh
    // clock rather than the timestamp from before the network operations.
    if (this.mediaStorage) input = { ...input, now: new Date() };
    return this.client.$transaction(async (tx) => {
      const request = await tx.accountDeletionRequest.findFirst({
        where: {
          id: input.requestId,
          userId: input.userId,
          status: 'PROCESSING',
          leaseOwner: input.workerId,
          leaseExpiresAt: { gt: input.now },
          user: { status: 'SUSPENDED' },
        },
        select: { id: true, userId: true, summary: true },
      });
      if (!request) return null;

      const [organizationKnowledge, organizationBunshins] = await Promise.all([
        tx.ownerKnowledge.count({
          where: { ownerUserId: input.userId, workspace: { type: 'ORGANIZATION' } },
        }),
        tx.bunshin.count({
          where: { ownerUserId: input.userId, workspace: { type: 'ORGANIZATION' } },
        }),
      ]);
      if (organizationKnowledge > 0 || organizationBunshins > 0) {
        await tx.accountDeletionRequest.update({
          where: { id: request.id },
          data: {
            status: 'BLOCKED',
            blockedReason: 'MANUAL_REVIEW_REQUIRED',
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        return {
          requestId: request.id,
          userId: request.userId,
          status: 'BLOCKED' as const,
          blockedReason: 'MANUAL_REVIEW_REQUIRED' as const,
        };
      }

      const personalWorkspaces = await tx.workspaceMembership.findMany({
        where: { userId: input.userId, workspace: { type: 'PERSONAL' } },
        select: { workspaceId: true },
      });
      const workspaceIds = personalWorkspaces.map(({ workspaceId }) => workspaceId);
      const scope = { workspaceId: { in: workspaceIds } };
      const personalBunshins =
        workspaceIds.length === 0
          ? []
          : await tx.bunshin.findMany({ where: scope, select: { id: true } });
      const bunshinIds = personalBunshins.map(({ id }) => id);

      const [identities, lineConnections, linePreferences, deepLinks, posts, activities] =
        await Promise.all([
          tx.authIdentity.deleteMany({ where: { userId: input.userId } }),
          tx.lineConnection.deleteMany({ where: { userId: input.userId } }),
          tx.lineNotificationPreference.deleteMany({ where: { userId: input.userId } }),
          tx.missionDeepLinkState.deleteMany({ where: { userId: input.userId } }),
          tx.postRecord.updateMany({
            where: { actorUserId: input.userId },
            data: { postUrl: null, externalPostId: null, manualMetrics: Prisma.DbNull },
          }),
          tx.missionActivity.updateMany({
            where: { actorUserId: input.userId },
            data: { metadata: Prisma.DbNull },
          }),
        ]);

      if (workspaceIds.length > 0) {
        await Promise.all([
          tx.workspace.updateMany({
            where: { id: { in: workspaceIds }, type: 'PERSONAL' },
            data: { name: '退会済みワークスペース', status: 'ARCHIVED' },
          }),
          tx.bunshin.updateMany({
            where: scope,
            data: {
              name: '退会済みBunshin',
              objectiveSummary: '',
              audienceSummary: '',
              personalitySummary: '',
              avatarUrl: null,
              status: 'ARCHIVED',
              archivedAt: input.now,
            },
          }),
          tx.bunshinObjective.updateMany({
            where: { bunshinId: { in: bunshinIds } },
            data: {
              objectiveType: 'DELETED',
              primaryGoal: '',
              kpiName: null,
              kpiTarget: null,
              kpiPeriod: null,
              status: 'INACTIVE',
            },
          }),
          tx.bunshinAudience.updateMany({
            where: { bunshinId: { in: bunshinIds } },
            data: {
              label: '',
              ageRange: null,
              occupation: null,
              experienceLevel: null,
              painPoints: [],
              desires: [],
              excludedAudience: [],
              notes: null,
            },
          }),
          tx.bunshinPersonality.updateMany({
            where: { bunshinId: { in: bunshinIds } },
            data: {
              tone: '',
              formality: '',
              energyLevel: '',
              expertiseLevel: '',
              sentenceStyle: '',
              firstPerson: '',
              forbiddenExpressions: [],
              preferredExpressions: [],
              visualDirection: null,
            },
          }),
          tx.ownerKnowledge.updateMany({
            where: scope,
            data: {
              title: '退会済みデータ',
              content: '',
              status: 'ARCHIVED',
              archivedAt: input.now,
            },
          }),
          tx.bunshinMemory.updateMany({
            where: scope,
            data: {
              content: '',
              summary: null,
              sourceId: null,
              active: false,
              deletedAt: input.now,
            },
          }),
          tx.bunshinCapabilityAssignment.updateMany({
            where: scope,
            data: { status: 'SUSPENDED', config: {} },
          }),
          tx.socialProfile.updateMany({
            where: scope,
            data: { handle: null, profileUrl: null, purpose: '', preferredFormats: [] },
          }),
          tx.socialAccountStrategy.updateMany({
            where: scope,
            data: {
              destinationDetail: null,
              concept: '',
              positioning: '',
              targetSummary: '',
              profileDraft: '',
              ctaStrategy: '',
              postingPolicy: '',
            },
          }),
          tx.contentPillar.updateMany({
            where: scope,
            data: { description: null, active: false, deletedAt: input.now },
          }),
          tx.weeklyPlan.updateMany({ where: scope, data: { strategySummary: null } }),
          tx.weeklyPlanItem.updateMany({
            where: scope,
            data: { goal: '', angle: '', notes: null },
          }),
          tx.dailyMission.updateMany({
            where: scope,
            data: { topic: '', angle: '', reason: '' },
          }),
          tx.missionContent.updateMany({ where: scope, data: { contentJson: {} } }),
          tx.missionDecision.updateMany({ where: scope, data: { rejectionDetail: null } }),
          tx.missionActivity.updateMany({ where: scope, data: { metadata: Prisma.DbNull } }),
          tx.postRecord.updateMany({
            where: scope,
            data: { postUrl: null, externalPostId: null, manualMetrics: Prisma.DbNull },
          }),
        ]);
        const contentPillars = await tx.contentPillar.findMany({
          where: scope,
          select: { id: true },
        });
        await Promise.all([
          ...personalBunshins.map(({ id }) =>
            tx.bunshin.update({ where: { id }, data: { slug: `deleted-${id}` } }),
          ),
          ...contentPillars.map(({ id }) =>
            tx.contentPillar.update({ where: { id }, data: { title: `deleted-${id}` } }),
          ),
        ]);
      }

      const mediaOwner = { ownerUserId: input.userId };
      await Promise.all([
        tx.serviceMemberBusinessProfile.deleteMany({ where: { userId: input.userId } }),
        tx.videoProject.updateMany({
          where: mediaOwner,
          data: {
            title: '退会済みデータ',
            photoAssetIds: [],
            narrationEnabled: false,
            status: 'CANCELLED',
            characterProfileSnapshot: {},
            characterReferenceSnapshot: [],
            disclosureSnapshot: {},
          },
        }),
        tx.videoScene.updateMany({
          where: { videoProject: mediaOwner },
          data: {
            narration: '',
            caption: '',
            visualPrompt: null,
            keywords: [],
          },
        }),
        tx.videoAsset.updateMany({
          where: mediaOwner,
          data: { originalFilename: 'deleted', usageTerms: null },
        }),
        tx.videoRender.updateMany({ where: mediaOwner, data: { notificationSnapshot: null } }),
        tx.videoSceneGeneration.updateMany({ where: mediaOwner, data: { inputSnapshot: {} } }),
        tx.socialImageGenerationRequest.updateMany({
          where: mediaOwner,
          data: {
            status: 'CANCELLED',
            layout: {},
            referenceImage: Prisma.DbNull,
          },
        }),
        tx.videoDelivery.updateMany({
          where: mediaOwner,
          data: {
            status: 'REVOKED',
            notificationStatus: 'CANCELLED',
            notificationSnapshot: null,
            revokedAt: input.now,
          },
        }),
      ]);
      const memberships = await tx.workspaceMembership.updateMany({
        where: { userId: input.userId },
        data: { status: 'REVOKED' },
      });
      await tx.user.update({
        where: { id: input.userId },
        data: { status: 'DELETED', email: null, displayName: '退会済みユーザー' },
      });
      await tx.accountDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'COMPLETED',
          completedAt: input.now,
          leaseOwner: null,
          leaseExpiresAt: null,
          blockedReason: null,
          lastErrorCategory: null,
          summary: {
            identitiesDeleted: identities.count,
            lineConnectionsDeleted: lineConnections.count,
            linePreferencesDeleted: linePreferences.count,
            deepLinksDeleted: deepLinks.count,
            postRecordsSanitized: posts.count,
            activitiesSanitized: activities.count,
            membershipsRevoked: memberships.count,
            personalWorkspacesArchived: workspaceIds.length,
          },
        },
      });
      return {
        requestId: request.id,
        userId: request.userId,
        status: 'COMPLETED' as const,
        blockedReason: null,
      };
    });
  }
}
