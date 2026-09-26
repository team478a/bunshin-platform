import 'server-only';
import type { ServiceLineBroadcastJobHandler } from '@bunshin/application';
import { currentLineEnvironment } from '../line/secure-configuration';
import {
  completeDisabledServiceLineBroadcast,
  completeServiceLineBroadcast,
  exhaustPendingServiceLineBroadcastRecipients,
} from './service-line-broadcast-completion';
import { deliverServiceLineBroadcastRecipients } from './service-line-broadcast-recipient-delivery';
import { resolveServiceLineBroadcastRecipientIds } from './service-line-broadcast-eligibility';

export function createServiceLineBroadcastJobHandler(): ServiceLineBroadcastJobHandler {
  return {
    async execute({ job, broadcastId }) {
      const db = await import('@bunshin/database');
      const broadcast = await db.prisma.serviceLineBroadcast.findFirst({
        where: { id: broadcastId, workspaceId: job.workspaceId, status: 'SCHEDULED' },
      });
      if (!broadcast) return { retryable: false };
      const environment = currentLineEnvironment();
      const policy = await db.prisma.groupLineRoutingPolicy.findUnique({
        where: {
          workspaceId_groupId_environment: {
            workspaceId: broadcast.workspaceId,
            groupId: broadcast.groupId,
            environment,
          },
        },
        select: { mode: true, pilotEnabled: true },
      });
      const mode = policy?.mode ?? 'SHARED';
      if (mode === 'DISABLED' || (mode === 'DEDICATED' && !policy?.pilotEnabled)) {
        await completeDisabledServiceLineBroadcast({ db, broadcast, completedAt: new Date() });
        return { retryable: false };
      }

      const configuration =
        mode === 'DEDICATED'
          ? await db.prisma.groupLineChannelConfiguration.findFirst({
              where: {
                workspaceId: broadcast.workspaceId,
                groupId: broadcast.groupId,
                environment,
                status: 'ACTIVE',
                lastVerifiedAt: { not: null },
                lastErrorCategory: null,
                globallyPaused: false,
              },
              select: { id: true, encryptedAccessToken: true },
            })
          : await db.prisma.lineChannelConfiguration.findFirst({
              where: {
                environment,
                status: 'ACTIVE',
                lastVerifiedAt: { not: null },
                lastErrorCategory: null,
                globallyPaused: false,
              },
              select: { id: true, encryptedAccessToken: true },
            });
      if (!configuration) {
        if (job.attemptCount < job.maxAttempts)
          return { retryable: true, category: 'LINE_CONFIGURATION_UNAVAILABLE' };
        await exhaustPendingServiceLineBroadcastRecipients({
          db,
          broadcast,
          category: 'LINE_CONFIGURATION_UNAVAILABLE',
          completedAt: new Date(),
        });
        return { retryable: false };
      }

      const recipients = await db.prisma.serviceLineBroadcastRecipient.findMany({
        where: {
          workspaceId: broadcast.workspaceId,
          groupId: broadcast.groupId,
          broadcastId: broadcast.id,
          status: 'PENDING',
        },
        select: { id: true, groupMembershipId: true, userId: true, message: true },
        take: 500,
      });
      const recipientIds = await resolveServiceLineBroadcastRecipientIds({
        db,
        broadcast,
        configuration,
        environment,
        mode,
        recipients,
      });
      const summary = await deliverServiceLineBroadcastRecipients({
        db,
        job,
        broadcast,
        configuration,
        recipients,
        recipientIds,
      });
      const pending = await db.prisma.serviceLineBroadcastRecipient.count({
        where: {
          workspaceId: broadcast.workspaceId,
          groupId: broadcast.groupId,
          broadcastId: broadcast.id,
          status: 'PENDING',
        },
      });
      if (pending > 0) {
        if (job.attemptCount < job.maxAttempts)
          return {
            retryable: true,
            category: summary.lastRetryableCategory ?? 'BROADCAST_BATCH_REMAINING',
          };
        const exhausted = await exhaustPendingServiceLineBroadcastRecipients({
          db,
          broadcast,
          category: summary.lastRetryableCategory ?? 'BROADCAST_RETRY_EXHAUSTED',
          completedAt: new Date(),
          processedBefore: summary.processed,
          failedBefore: summary.failed,
        });
        summary.processed += exhausted;
        summary.failed += exhausted;
      } else {
        await completeServiceLineBroadcast({
          db,
          broadcast,
          processed: summary.processed,
          failed: summary.failed,
          completedAt: new Date(),
        });
      }
      return { retryable: false };
    },
  };
}
