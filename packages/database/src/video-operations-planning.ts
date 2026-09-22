import {
  VIDEO_AI_SCENE_ADMIN_RETRYABLE_FAILURES,
  VIDEO_RENDER_ADMIN_RETRYABLE_FAILURES,
} from '@bunshin/application';
import type {
  VideoPlanningContextRepository,
  VideoRenderCompletionRepository,
  VideoRenderOperationsRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';
import { reserveVideoMedia } from './video-media-quota';

const emptyVideoRenderCounts = () => ({
  QUEUED: 0,
  SUBMITTED: 0,
  RENDERING: 0,
  SUCCEEDED: 0,
  FAILED: 0,
  CANCELLED: 0,
});

const emptyVideoSceneGenerationCounts = () => ({
  QUEUED: 0,
  SUBMITTED: 0,
  GENERATING: 0,
  SUCCEEDED: 0,
  FAILED: 0,
  CANCELLED: 0,
});

export class PrismaVideoRenderOperationsRepository implements VideoRenderOperationsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async getSnapshot(input: Parameters<VideoRenderOperationsRepository['getSnapshot']>[0]) {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const jobs = await this.client.job.findMany({
      where: {
        environment: input.environment,
        jobType: { in: ['VIDEO_RENDER_PROCESS', 'VIDEO_AI_SCENE_GENERATION_PROCESS'] },
      },
      select: { payloadReference: true },
    });
    const renderIds = [
      ...new Set(
        jobs
          .map(
            ({ payloadReference }) => /^video-render:([0-9a-f-]{36})$/i.exec(payloadReference)?.[1],
          )
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const sceneGenerationIds = [
      ...new Set(
        jobs
          .map(
            ({ payloadReference }) =>
              /^video-ai-scene:([0-9a-f-]{36})$/i.exec(payloadReference)?.[1],
          )
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const rows = await this.client.videoRender.findMany({
      where: { id: { in: renderIds } },
      include: { project: { select: { title: true, group: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const counts = emptyVideoRenderCounts();
    const sceneCounts = emptyVideoSceneGenerationCounts();
    const [groupedCounts, sceneGroupedCounts, sceneRows] = await Promise.all([
      this.client.videoRender.groupBy({
        by: ['status'],
        where: { id: { in: renderIds } },
        _count: { _all: true },
      }),
      this.client.videoSceneGeneration.groupBy({
        by: ['status'],
        where: { id: { in: sceneGenerationIds } },
        _count: { _all: true },
      }),
      this.client.videoSceneGeneration.findMany({
        where: { id: { in: sceneGenerationIds } },
        include: {
          scene: { select: { sceneNo: true } },
          project: { select: { title: true, group: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    for (const row of groupedCounts) counts[row.status] = row._count._all;
    for (const row of sceneGroupedCounts) sceneCounts[row.status] = row._count._all;
    return {
      counts,
      items: rows.map((row) => ({
        id: row.id,
        projectTitle: row.project.title,
        groupName: row.project.group.name,
        provider: row.provider,
        status: row.status,
        errorCode: row.errorCode,
        externalJobRegistered: Boolean(row.externalJobId),
        retryable:
          row.status === 'FAILED' &&
          VIDEO_RENDER_ADMIN_RETRYABLE_FAILURES.includes(
            row.errorCode as (typeof VIDEO_RENDER_ADMIN_RETRYABLE_FAILURES)[number],
          ),
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        usageCountedAt: row.usageCountedAt,
        notificationStatus: row.notificationStatus,
        notifiedAt: row.notifiedAt,
      })),
      sceneCounts,
      sceneItems: sceneRows.map((row) => ({
        id: row.id,
        projectTitle: row.project.title,
        groupName: row.project.group.name,
        sceneNo: row.scene.sceneNo,
        provider: row.provider,
        model: row.model,
        status: row.status,
        errorCode: row.errorCode,
        estimatedCostUsdMicros: row.estimatedCostUsdMicros,
        actualCostUsdMicros: row.actualCostUsdMicros,
        retryable:
          row.status === 'FAILED' &&
          VIDEO_AI_SCENE_ADMIN_RETRYABLE_FAILURES.includes(
            row.errorCode as (typeof VIDEO_AI_SCENE_ADMIN_RETRYABLE_FAILURES)[number],
          ),
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
      })),
    };
  }

  async requestRetry(input: Parameters<VideoRenderOperationsRepository['requestRetry']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const now = new Date();
        const admin = await tx.platformAdmin.findFirst({
          where: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
          },
          select: { id: true },
        });
        if (!admin) return null;
        const render = await tx.videoRender.findFirst({
          where: {
            id: input.renderId,
            status: 'FAILED',
            errorCode: { in: [...VIDEO_RENDER_ADMIN_RETRYABLE_FAILURES] },
            completedAt: { not: null },
            project: {
              status: 'FAILED',
              group: {
                status: 'ACTIVE',
                featurePolicies: {
                  some: {
                    featureKey: 'VIDEO_GENERATION',
                    status: 'ENABLED',
                    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
                  },
                },
              },
              groupMembership: {
                status: 'ACTIVE',
                consentedAt: { not: null },
                featureAssignments: {
                  some: {
                    featureKey: 'VIDEO_GENERATION',
                    status: 'ENABLED',
                    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
                  },
                },
              },
              ownerUser: { status: 'ACTIVE' },
              workspace: { status: 'ACTIVE' },
            },
          },
          include: { project: { select: { bunshinId: true } } },
        });
        if (!render?.completedAt) return null;
        const originalJob = await tx.job.findFirst({
          where: {
            environment: input.environment,
            jobType: 'VIDEO_RENDER_PROCESS',
            payloadReference: `video-render:${render.id}`,
          },
          select: { id: true },
        });
        if (!originalJob) return null;
        const nextStatus = render.externalJobId ? 'SUBMITTED' : 'QUEUED';
        await reserveVideoMedia(tx, render);
        const changed = await tx.videoRender.updateMany({
          where: { id: render.id, status: 'FAILED', completedAt: render.completedAt },
          data: { status: nextStatus, errorCode: null, completedAt: null },
        });
        if (changed.count !== 1) return null;
        await tx.videoProject.update({
          where: { id: render.videoProjectId },
          data: { status: render.externalJobId ? 'RENDERING' : 'QUEUED' },
        });
        const job = await tx.job.create({
          data: {
            environment: input.environment,
            workspaceId: render.workspaceId,
            bunshinId: render.project.bunshinId,
            jobType: 'VIDEO_RENDER_PROCESS',
            payloadReference: `video-render:${render.id}`,
            idempotencyKey: `video-render-admin-retry:${render.id}:${render.completedAt.toISOString()}`,
            correlationId: input.requestId,
            requestedBy: render.ownerUserId,
            priority: 40,
            maxAttempts: 12,
          },
        });
        return tx.videoRenderRetryRequest.create({
          data: {
            id: input.requestId,
            environment: input.environment,
            videoRenderId: render.id,
            failedAtSnapshot: render.completedAt,
            actorUserId: input.actorUserId,
            reason: input.reason,
            jobId: job.id,
          },
          select: { id: true, jobId: true, createdAt: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'this video render failure already has a retry job');
      throw error;
    }
  }

  async requestSceneRetry(
    input: Parameters<VideoRenderOperationsRepository['requestSceneRetry']>[0],
  ) {
    try {
      return await this.client.$transaction(async (tx) => {
        const now = new Date();
        const admin = await tx.platformAdmin.findFirst({
          where: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
          },
          select: { id: true },
        });
        if (!admin) return null;
        const generation = await tx.videoSceneGeneration.findFirst({
          where: {
            id: input.generationId,
            status: 'FAILED',
            errorCode: { in: [...VIDEO_AI_SCENE_ADMIN_RETRYABLE_FAILURES] },
            completedAt: { not: null },
            project: {
              status: 'FAILED',
              group: {
                status: 'ACTIVE',
                featurePolicies: {
                  some: {
                    featureKey: 'VIDEO_GENERATION',
                    status: 'ENABLED',
                    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
                  },
                },
              },
              groupMembership: {
                status: 'ACTIVE',
                consentedAt: { not: null },
                featureAssignments: {
                  some: {
                    featureKey: 'VIDEO_GENERATION',
                    status: 'ENABLED',
                    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
                  },
                },
              },
              ownerUser: { status: 'ACTIVE' },
              workspace: { status: 'ACTIVE' },
            },
          },
          include: { project: { select: { bunshinId: true } } },
        });
        if (!generation?.completedAt) return null;
        const originalJob = await tx.job.findFirst({
          where: {
            environment: input.environment,
            jobType: 'VIDEO_AI_SCENE_GENERATION_PROCESS',
            payloadReference: `video-ai-scene:${generation.id}`,
          },
          select: { id: true },
        });
        if (!originalJob) return null;
        await reserveVideoMedia(tx, generation);
        const changed = await tx.videoSceneGeneration.updateMany({
          where: { id: generation.id, status: 'FAILED', completedAt: generation.completedAt },
          data: {
            status: 'QUEUED',
            externalJobId: null,
            outputStorageKey: null,
            errorCode: null,
            startedAt: null,
            completedAt: null,
            actualCostUsdMicros: null,
          },
        });
        if (changed.count !== 1) return null;
        await tx.videoProject.update({
          where: { id: generation.videoProjectId },
          data: { status: 'QUEUED' },
        });
        const job = await tx.job.create({
          data: {
            environment: input.environment,
            workspaceId: generation.workspaceId,
            bunshinId: generation.project.bunshinId,
            jobType: 'VIDEO_AI_SCENE_GENERATION_PROCESS',
            payloadReference: `video-ai-scene:${generation.id}`,
            idempotencyKey: `video-ai-scene-admin-retry:${generation.id}:${generation.completedAt.toISOString()}`,
            correlationId: input.requestId,
            requestedBy: generation.ownerUserId,
            priority: 40,
            maxAttempts: 12,
          },
        });
        return tx.videoSceneGenerationRetryRequest.create({
          data: {
            id: input.requestId,
            environment: input.environment,
            videoSceneGenerationId: generation.id,
            failedAtSnapshot: generation.completedAt,
            actorUserId: input.actorUserId,
            reason: input.reason,
            jobId: job.id,
          },
          select: { id: true, jobId: true, createdAt: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError(
          'CONFLICT',
          'this video scene generation failure already has a retry job',
        );
      throw error;
    }
  }
}

export class PrismaVideoRenderCompletionRepository implements VideoRenderCompletionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async finalize(input: Parameters<VideoRenderCompletionRepository['finalize']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const render = await tx.videoRender.findFirst({
          where: {
            id: input.renderId,
            workspaceId: input.workspaceId,
            status: 'SUCCEEDED',
            completedAt: { not: null },
            outputStorageKey: { not: null },
          },
          include: { project: { select: { bunshinId: true, title: true } } },
        });
        if (!render) return null;
        const environmentJob = await tx.job.findFirst({
          where: {
            environment: input.environment,
            workspaceId: input.workspaceId,
            jobType: 'VIDEO_RENDER_PROCESS',
            payloadReference: `video-render:${render.id}`,
          },
          select: { id: true },
        });
        if (!environmentJob) return null;
        await tx.groupFeatureUsageEvent.upsert({
          where: {
            groupMembershipId_featureKey_operationKey: {
              groupMembershipId: render.groupMembershipId,
              featureKey: 'VIDEO_GENERATION',
              operationKey: `video-render-completed:${render.id}`,
            },
          },
          update: {},
          create: {
            workspaceId: render.workspaceId,
            groupId: render.groupId,
            groupMembershipId: render.groupMembershipId,
            featureKey: 'VIDEO_GENERATION',
            actorUserId: render.ownerUserId,
            operationKey: `video-render-completed:${render.id}`,
            localDate: input.localDate,
            localMonth: input.localDate.slice(0, 7),
            occurredAt: input.completedAt,
          },
        });
        const updated = await tx.videoRender.update({
          where: { id: render.id },
          data: {
            ...(render.usageCountedAt ? {} : { usageCountedAt: input.completedAt }),
            ...(render.notificationStatus ? {} : { notificationStatus: 'PENDING' }),
          },
        });
        return {
          renderId: render.id,
          workspaceId: render.workspaceId,
          groupId: render.groupId,
          bunshinId: render.project.bunshinId,
          ownerUserId: render.ownerUserId,
          videoProjectId: render.videoProjectId,
          projectTitle: render.project.title,
          completedAt: render.completedAt!,
          notificationStatus: updated.notificationStatus ?? 'PENDING',
          notificationAttemptCount: updated.notificationAttemptCount,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async recordNotification(
    input: Parameters<VideoRenderCompletionRepository['recordNotification']>[0],
  ) {
    const changed = await this.client.videoRender.updateMany({
      where: {
        id: input.renderId,
        status: 'SUCCEEDED',
        notificationStatus: { in: ['PENDING', 'FAILED'] },
      },
      data: {
        notificationStatus: input.status,
        notificationErrorCode: input.errorCode,
        notificationAttemptCount: { increment: 1 },
        ...(input.status === 'SENT' ? { notifiedAt: input.attemptedAt } : {}),
      },
    });
    return changed.count === 1;
  }
}

export class PrismaVideoPlanningContextRepository implements VideoPlanningContextRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findAuthorized(input: Parameters<VideoPlanningContextRepository['findAuthorized']>[0]) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { not: 'ARCHIVED' },
        videoProjects: {
          some: {
            id: input.videoProjectId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            ownerUserId: input.actorUserId,
          },
        },
      },
      include: { personality: true },
    });
    if (!bunshin) return null;
    const project = await this.client.videoProject.findFirst({
      where: {
        id: input.videoProjectId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        bunshinId: input.bunshinId,
        campaignId: input.campaignId,
      },
      select: { characterProfileSnapshot: true, characterReferenceSnapshot: true },
    });
    if (!project) return null;
    const characterSnapshot =
      project.characterProfileSnapshot !== null &&
      typeof project.characterProfileSnapshot === 'object' &&
      !Array.isArray(project.characterProfileSnapshot)
        ? (project.characterProfileSnapshot as Record<string, unknown>)
        : {};
    const referenceSnapshot = Array.isArray(project.characterReferenceSnapshot)
      ? project.characterReferenceSnapshot
      : [];
    const safetyRules = Array.isArray(characterSnapshot.safetyRules)
      ? characterSnapshot.safetyRules.filter((item): item is string => typeof item === 'string')
      : [];
    const character =
      typeof characterSnapshot.name === 'string' &&
      typeof characterSnapshot.appearance === 'string' &&
      typeof characterSnapshot.worldSetting === 'string'
        ? {
            name: characterSnapshot.name,
            appearance: characterSnapshot.appearance,
            worldSetting: characterSnapshot.worldSetting,
            safetyRules,
            referenceImageCount: referenceSnapshot.length,
          }
        : null;

    const now = new Date();
    const userAssets = await this.client.videoAsset.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        status: 'READY',
        kind: { in: ['IMAGE', 'VIDEO', 'LOGO'] },
        AND: [
          { OR: [{ videoProjectId: null }, { videoProjectId: input.videoProjectId }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    let product = null;
    let approvedAssets: Array<{ assetId: string; description: string }> = [];
    if (input.campaignId) {
      const campaign = await this.client.campaign.findFirst({
        where: {
          id: input.campaignId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'OPEN',
          startsAt: { lte: now },
          endsAt: { gt: now },
          group: {
            status: 'ACTIVE',
            memberships: {
              some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
            },
          },
          participations: {
            some: {
              participantWorkspaceId: input.workspaceId,
              userId: input.actorUserId,
              bunshinId: input.bunshinId,
              status: 'ACCEPTED',
            },
          },
          productPackVersion: {
            status: 'PUBLISHED',
            assignments: { some: { bunshinId: input.bunshinId, status: 'ACTIVE' } },
          },
        },
        include: {
          productPackVersion: {
            include: {
              productPack: true,
              rules: { orderBy: { sortOrder: 'asc' } },
            },
          },
          assets: { include: { productPackAsset: true }, orderBy: { sortOrder: 'asc' } },
        },
      });
      if (!campaign) return null;
      const facts = campaign.productPackVersion.facts as Record<string, unknown>;
      product = {
        name: campaign.productPackVersion.productPack.name,
        facts: [
          campaign.productPackVersion.summary,
          ...Object.entries(facts).map(([key, value]) => `${key}: ${String(value)}`),
        ],
        requiredDisclosures: campaign.productPackVersion.rules
          .filter((rule) => rule.type === 'REQUIRED_DISCLOSURE')
          .map((rule) => rule.value),
        prohibitedExpressions: campaign.productPackVersion.rules
          .filter((rule) => rule.type === 'FORBIDDEN_EXPRESSION')
          .map((rule) => rule.value),
      };
      approvedAssets = campaign.assets
        .filter(({ productPackAsset }) =>
          productPackAsset.validUntil ? productPackAsset.validUntil > now : true,
        )
        .map(({ productPackAsset }) => ({
          assetId: productPackAsset.id,
          description: `${productPackAsset.label}（${productPackAsset.usageTerms}）`,
        }));
    }

    return {
      objective: bunshin.objectiveSummary,
      audience: bunshin.audienceSummary,
      personality: {
        tone: bunshin.personality?.tone ?? bunshin.personalitySummary,
        preferredExpressions:
          (bunshin.personality?.preferredExpressions as string[] | undefined) ?? [],
        prohibitedExpressions:
          (bunshin.personality?.forbiddenExpressions as string[] | undefined) ?? [],
      },
      character,
      product,
      approvedAssets,
      userAssets: userAssets.map((asset) => ({
        assetId: asset.id,
        kind: asset.kind as 'IMAGE' | 'VIDEO' | 'LOGO',
        description: `${asset.originalFilename}${asset.usageTerms ? `（${asset.usageTerms}）` : ''}`,
      })),
    };
  }
}
