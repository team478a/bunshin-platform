import { AesGcmLineSecretCrypto } from '../line/secure-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';
import type { ServiceLineBroadcastBatch } from './service-line-broadcast-delivery-types';

export interface ServiceLineBroadcastTextProvider {
  pushText(input: {
    accessToken: string;
    recipientId: string;
    text: string;
    retryKey: string;
  }): Promise<{ ok: true } | { ok: false; category: string; retryable: boolean }>;
}

export interface ServiceLineBroadcastDeliverySummary {
  processed: number;
  failed: number;
  retryableFailures: number;
  lastRetryableCategory: string | null;
}

export async function deliverServiceLineBroadcastRecipients(
  batch: ServiceLineBroadcastBatch,
  dependencies: {
    provider?: ServiceLineBroadcastTextProvider;
    decrypt?: (encrypted: string) => string;
    now?: () => Date;
  } = {},
): Promise<ServiceLineBroadcastDeliverySummary> {
  const provider = dependencies.provider ?? new LineMessagingApiAdapter();
  const decrypt =
    dependencies.decrypt ??
    ((encrypted: string) => new AesGcmLineSecretCrypto().decrypt(encrypted));
  const now = dependencies.now ?? (() => new Date());
  const token = decrypt(batch.configuration.encryptedAccessToken);
  const summary: ServiceLineBroadcastDeliverySummary = {
    processed: 0,
    failed: 0,
    retryableFailures: 0,
    lastRetryableCategory: null,
  };

  for (const recipient of batch.recipients) {
    const providerUserId = batch.recipientIds.get(recipient.groupMembershipId);
    if (!providerUserId) {
      await batch.db.prisma.serviceLineBroadcastRecipient.updateMany({
        where: {
          id: recipient.id,
          workspaceId: batch.broadcast.workspaceId,
          groupId: batch.broadcast.groupId,
          broadcastId: batch.broadcast.id,
          status: 'PENDING',
        },
        data: { status: 'SKIPPED', errorCategory: 'RECIPIENT_NOT_ELIGIBLE' },
      });
      summary.processed += 1;
      continue;
    }

    const outcome = await provider.pushText({
      accessToken: token,
      recipientId: providerUserId,
      text: recipient.message ?? batch.broadcast.message,
      retryKey: recipient.id,
    });
    if (outcome.ok) {
      await batch.db.prisma.serviceLineBroadcastRecipient.updateMany({
        where: {
          id: recipient.id,
          workspaceId: batch.broadcast.workspaceId,
          groupId: batch.broadcast.groupId,
          broadcastId: batch.broadcast.id,
          status: 'PENDING',
        },
        data: { status: 'SENT', deliveredAt: now(), errorCategory: null },
      });
      summary.processed += 1;
      continue;
    }

    if (outcome.retryable) {
      await batch.db.prisma.serviceLineBroadcastRecipient.updateMany({
        where: {
          id: recipient.id,
          workspaceId: batch.broadcast.workspaceId,
          groupId: batch.broadcast.groupId,
          broadcastId: batch.broadcast.id,
          status: 'PENDING',
        },
        data: { errorCategory: outcome.category },
      });
      summary.retryableFailures += 1;
      summary.lastRetryableCategory = outcome.category;
      continue;
    }

    await batch.db.prisma.serviceLineBroadcastRecipient.updateMany({
      where: {
        id: recipient.id,
        workspaceId: batch.broadcast.workspaceId,
        groupId: batch.broadcast.groupId,
        broadcastId: batch.broadcast.id,
        status: 'PENDING',
      },
      data: { status: 'FAILED', errorCategory: outcome.category },
    });
    summary.processed += 1;
    summary.failed += 1;
  }
  return summary;
}
