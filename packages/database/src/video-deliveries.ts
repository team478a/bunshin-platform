import type { VideoDeliveryRecord, VideoDeliveryRepository } from '@bunshin/application';
import { type Prisma, type PrismaClient, prisma } from './client';

const videoDeliveryRecord = (row: Prisma.VideoDeliveryGetPayload<object>): VideoDeliveryRecord => {
  const { notificationSnapshot, ...record } = row;
  void notificationSnapshot;
  return {
    ...record,
    rightsSnapshot: row.rightsSnapshot as Record<string, unknown>,
  };
};

export class PrismaVideoDeliveryRepository implements VideoDeliveryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async serviceManager(workspaceId: string, groupId: string, actorUserId: string) {
    return (
      (await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          status: 'ACTIVE',
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
          group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
        },
        select: { id: true },
      })) !== null
    );
  }

  async assign(input: Parameters<VideoDeliveryRepository['assign']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const render = await tx.videoRender.findFirst({
        where: {
          id: input.videoRenderId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          videoProjectId: input.videoProjectId,
          status: 'SUCCEEDED',
          outputStorageKey: { not: null },
        },
      });
      if (render === null) return null;
      const membership = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'ACTIVE',
          userId: render.ownerUserId,
        },
      });
      if (membership === null) return null;
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          ownerUserId: membership.userId,
        },
      });
      if (project === null) return null;
      if (input.programEnrollmentId !== null) {
        const enrollment = await tx.programEnrollment.findFirst({
          where: {
            id: input.programEnrollmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            status: { in: ['INVITED', 'ACTIVE'] },
          },
          select: { id: true },
        });
        if (enrollment === null) return null;
      }
      const existing = await tx.videoDelivery.findUnique({
        where: { videoRenderId: input.videoRenderId },
        select: { id: true },
      });
      if (existing !== null) return null;
      if (input.replacesVideoDeliveryId !== null) {
        const replaced = await tx.videoDelivery.findFirst({
          where: {
            id: input.replacesVideoDeliveryId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            ownerUserId: membership.userId,
            status: 'REVOKED',
            replacesVideoDeliveryId: null,
          },
          select: { id: true, programEnrollmentId: true },
        });
        if (replaced === null || replaced.programEnrollmentId !== input.programEnrollmentId)
          return null;
      }
      const row = await tx.videoDelivery.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          ownerUserId: membership.userId,
          programEnrollmentId: input.programEnrollmentId,
          videoProjectId: project.id,
          videoRenderId: render.id,
          replacesVideoDeliveryId: input.replacesVideoDeliveryId,
          rightsSnapshot: input.rightsSnapshot as Prisma.InputJsonValue,
          expiresAt: input.expiresAt,
          assignedByUserId: input.actorUserId,
        },
      });
      await tx.videoDeliveryEvent.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          videoDeliveryId: row.id,
          eventType: 'ASSIGNED',
          eventData:
            input.replacesVideoDeliveryId === null
              ? {}
              : { replacesVideoDeliveryId: input.replacesVideoDeliveryId },
          performedByUserId: input.actorUserId,
        },
      });
      return videoDeliveryRecord(row);
    });
  }

  async findForRecipient(input: Parameters<VideoDeliveryRepository['findForRecipient']>[0]) {
    const membership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (membership === null) return null;
    const row = await this.client.videoDelivery.findFirst({
      where: {
        id: input.videoDeliveryId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: membership.id,
        ownerUserId: input.actorUserId,
      },
    });
    return row === null ? null : videoDeliveryRecord(row);
  }

  async recordAction(input: Parameters<VideoDeliveryRepository['recordAction']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const membership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (membership === null) return null;
      const delivery = await tx.videoDelivery.findFirst({
        where: {
          id: input.videoDeliveryId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: membership.id,
          ownerUserId: input.actorUserId,
        },
      });
      if (
        delivery === null ||
        delivery.status === 'REVOKED' ||
        (delivery.expiresAt !== null && delivery.expiresAt <= now)
      )
        return null;
      if (input.action === 'POSTED' && delivery.status === 'POSTED')
        return videoDeliveryRecord(delivery);
      const permitted =
        input.action === 'VIEWED'
          ? delivery.status !== 'DECLINED'
          : input.action === 'ACCEPTED' || input.action === 'DECLINED'
            ? ['ASSIGNED', 'VIEWED'].includes(delivery.status)
            : ['ACCEPTED', 'POSTED'].includes(delivery.status);
      if (!permitted) return null;
      const data =
        input.action === 'VIEWED'
          ? { status: delivery.status === 'ASSIGNED' ? 'VIEWED' : delivery.status, viewedAt: now }
          : input.action === 'ACCEPTED'
            ? { status: 'ACCEPTED' as const, acceptedAt: now }
            : input.action === 'DECLINED'
              ? { status: 'DECLINED' as const, declinedAt: now }
              : input.action === 'POSTED'
                ? { status: 'POSTED' as const, postedAt: now }
                : {};
      const row = await tx.videoDelivery.update({ where: { id: delivery.id }, data });
      await tx.videoDeliveryEvent.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          videoDeliveryId: delivery.id,
          eventType: input.action,
          eventData: input.eventData as Prisma.InputJsonValue,
          performedByUserId: input.actorUserId,
        },
      });
      return videoDeliveryRecord(row);
    });
  }

  async recordNotification(input: Parameters<VideoDeliveryRepository['recordNotification']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const delivery = await tx.videoDelivery.findFirst({
        where: {
          id: input.videoDeliveryId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
        },
        select: { id: true, notificationStatus: true },
      });
      if (delivery === null || delivery.notificationStatus === 'SENT') return null;
      const row = await tx.videoDelivery.update({
        where: { id: delivery.id },
        data: {
          notificationStatus: input.status,
          notificationErrorCode: input.errorCode,
          notificationAttemptCount: { increment: 1 },
          notifiedAt: input.attemptedAt,
        },
      });
      await tx.videoDeliveryEvent.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          videoDeliveryId: delivery.id,
          eventType: 'LINE_NOTIFICATION',
          eventData: {
            status: input.status,
            errorCode: input.errorCode,
          },
          performedByUserId: input.actorUserId,
        },
      });
      return videoDeliveryRecord(row);
    });
  }

  async revoke(input: Parameters<VideoDeliveryRepository['revoke']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const delivery = await tx.videoDelivery.findFirst({
        where: {
          id: input.videoDeliveryId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { not: 'REVOKED' },
        },
      });
      if (delivery === null) return null;
      const now = new Date();
      const row = await tx.videoDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'REVOKED',
          notificationStatus: 'CANCELLED',
          notificationSnapshot: null,
          revokedAt: now,
        },
      });
      await tx.videoDeliveryEvent.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          videoDeliveryId: delivery.id,
          eventType: 'REVOKED',
          eventData: { reason: input.reason },
          performedByUserId: input.actorUserId,
        },
      });
      return videoDeliveryRecord(row);
    });
  }
}
