import type { VideoProjectReviewRepository } from '@bunshin/application';
import type { PrismaClient } from './client';
import { hasActiveVideoProjectEntitlement } from './video-project-entitlement';
import { videoProjectRecord } from './video-records';

export class PrismaVideoProjectReviewRepository {
  constructor(private readonly client: PrismaClient) {}

  async review(input: Parameters<VideoProjectReviewRepository['review']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status:
            input.action === 'ADOPT'
              ? 'READY_FOR_REVIEW'
              : { in: ['READY_FOR_REVIEW', 'COMPLETED'] },
          renderAttempts: { some: { status: 'SUCCEEDED' } },
          group: { status: 'ACTIVE' },
          groupMembership: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            consentedAt: { not: null },
          },
        },
        select: { id: true, groupMembershipId: true, socialImageGenerationRequestId: true },
      });
      if (
        !project ||
        !(await hasActiveVideoProjectEntitlement(
          tx,
          {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: project.groupMembershipId,
            socialImageGenerationRequestId: project.socialImageGenerationRequestId,
          },
          now,
        ))
      )
        return null;
      const changed = await tx.videoProject.updateMany({
        where: {
          id: project.id,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status:
            input.action === 'ADOPT'
              ? 'READY_FOR_REVIEW'
              : { in: ['READY_FOR_REVIEW', 'COMPLETED'] },
        },
        data:
          input.action === 'ADOPT'
            ? {
                status: 'COMPLETED',
                revision: { increment: 1 },
                reviewDecision: 'ADOPTED',
                reviewReason: null,
                reviewNote: null,
                reviewedAt: now,
              }
            : {
                status: 'WAITING_APPROVAL',
                revision: { increment: 1 },
                reviewDecision: null,
                reviewReason: input.reviewReason,
                reviewNote: input.reviewNote,
                reviewedAt: now,
              },
      });
      if (changed.count !== 1) return null;
      if (input.action === 'REVISE')
        await tx.videoDelivery.updateMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            videoProjectId: input.videoProjectId,
            ownerUserId: input.actorUserId,
            status: { in: ['ASSIGNED', 'VIEWED', 'ACCEPTED'] },
          },
          data: { status: 'REVOKED', notificationSnapshot: null },
        });
      const row = await tx.videoProject.findUniqueOrThrow({
        where: { id: input.videoProjectId },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      return videoProjectRecord(row);
    });
  }
}
