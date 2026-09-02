import 'server-only';
import type { ServiceLineBroadcastJobHandler } from '@bunshin/application';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from '../line/secure-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';

export function createServiceLineBroadcastJobHandler(): ServiceLineBroadcastJobHandler {
  return {
    async execute({ job, broadcastId }) {
      const db = await import('@bunshin/database');
      const broadcast = await db.prisma.serviceLineBroadcast.findFirst({
        where: {
          id: broadcastId,
          workspaceId: job.workspaceId,
          status: 'SCHEDULED',
        },
      });
      if (!broadcast) return { retryable: false };
      const configuration = await db.prisma.groupLineChannelConfiguration.findFirst({
        where: {
          workspaceId: broadcast.workspaceId,
          groupId: broadcast.groupId,
          environment: currentLineEnvironment(),
          status: 'ACTIVE',
          lastVerifiedAt: { not: null },
          lastErrorCategory: null,
          globallyPaused: false,
        },
        select: { encryptedAccessToken: true },
      });
      if (!configuration) return { retryable: true, category: 'LINE_CONFIGURATION_UNAVAILABLE' };
      const recipients = await db.prisma.serviceLineBroadcastRecipient.findMany({
        where: {
          workspaceId: broadcast.workspaceId,
          groupId: broadcast.groupId,
          broadcastId: broadcast.id,
          status: 'PENDING',
        },
        select: { id: true, groupMembershipId: true },
        take: 500,
      });
      const connections = await db.prisma.groupLineConnection.findMany({
        where: {
          workspaceId: broadcast.workspaceId,
          groupId: broadcast.groupId,
          groupMembershipId: { in: recipients.map((recipient) => recipient.groupMembershipId) },
          status: 'ACTIVE',
          notificationConsentAt: { not: null },
          friendshipStatus: 'FOLLOWING',
        },
        select: { groupMembershipId: true, providerUserId: true },
      });
      const recipientIds = new Map(
        connections.map((item) => [item.groupMembershipId, item.providerUserId]),
      );
      const provider = new LineMessagingApiAdapter();
      const token = new AesGcmLineSecretCrypto().decrypt(configuration.encryptedAccessToken);
      let failed = 0;
      for (const recipient of recipients) {
        const providerUserId = recipientIds.get(recipient.groupMembershipId);
        if (!providerUserId) {
          await db.prisma.serviceLineBroadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: 'SKIPPED', errorCategory: 'RECIPIENT_NOT_ELIGIBLE' },
          });
          continue;
        }
        const outcome = await provider.pushText({
          accessToken: token,
          recipientId: providerUserId,
          text: broadcast.message,
        });
        if (outcome.ok) {
          await db.prisma.serviceLineBroadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: 'SENT', deliveredAt: new Date(), errorCategory: null },
          });
        } else {
          failed += 1;
          await db.prisma.serviceLineBroadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: 'FAILED', errorCategory: outcome.category },
          });
        }
      }
      const pending = await db.prisma.serviceLineBroadcastRecipient.count({
        where: { broadcastId: broadcast.id, status: 'PENDING' },
      });
      if (pending > 0) return { retryable: true, category: 'BROADCAST_BATCH_REMAINING' };
      await db.prisma.serviceLineBroadcast.update({
        where: { id: broadcast.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await db.prisma.serviceLineBroadcastAuditLog.create({
        data: {
          workspaceId: broadcast.workspaceId,
          groupId: broadcast.groupId,
          broadcastId: broadcast.id,
          action: 'DELIVERY_COMPLETED',
          beforeData: {},
          afterData: { processed: recipients.length, failed },
          reason: '予約または即時配信を実行',
          performedByUserId: broadcast.updatedByUserId,
        },
      });
      return { retryable: false };
    },
  };
}
