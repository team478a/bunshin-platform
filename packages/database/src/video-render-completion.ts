import type { VideoRenderCompletionRepository } from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';

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
