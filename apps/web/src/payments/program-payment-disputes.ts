import 'server-only';
import type { PrismaClient } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import {
  receiveWebhookEvent,
  recordFailedWebhookEvent,
  requireWebhookConfiguration,
} from './program-payment-webhook-events';

const openDisputeStatuses = new Set([
  'needs_response',
  'under_review',
  'warning_needs_response',
  'warning_under_review',
]);
const restoredDisputeStatuses = new Set(['won', 'warning_closed', 'prevented']);

export async function applyProgramPaymentDispute(
  client: PrismaClient,
  input: {
    configurationId: string;
    providerEventId: string;
    eventType: string;
    payloadDigest: string;
    paymentIntentId: string;
    disputeId: string;
    amount: number;
    currency: string;
    disputeStatus: string;
    livemode: boolean;
  },
) {
  try {
    return await client.$transaction(
      async (tx) => {
        const configuration = await requireWebhookConfiguration(tx, input);
        const webhook = await receiveWebhookEvent(tx, {
          ...input,
          workspaceId: configuration.workspaceId,
        });
        if (webhook.status === 'PROCESSED' || webhook.status === 'IGNORED') return false;
        const purchase = await tx.programPurchase.findFirst({
          where: {
            workspaceId: configuration.workspaceId,
            paymentConfigurationId: configuration.id,
            providerPaymentIntentId: input.paymentIntentId,
          },
        });
        if (
          !purchase ||
          input.amount <= 0 ||
          input.amount > purchase.amountYen ||
          purchase.currency.toLowerCase() !== input.currency.toLowerCase() ||
          !purchase.paidEnrollmentId
        ) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'FAILED', errorCategory: 'PURCHASE_MISMATCH', processedAt: new Date() },
          });
          throw new ApplicationError('FORBIDDEN', 'purchase verification failed');
        }
        const now = new Date();
        if (purchase.status === 'REFUNDED') {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: {
              status: 'IGNORED',
              errorCategory: 'PURCHASE_ALREADY_REFUNDED',
              processedAt: now,
            },
          });
          return false;
        }
        if (purchase.providerDisputeId === input.disputeId && purchase.disputeResolvedAt) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: {
              status: 'IGNORED',
              errorCategory: 'DISPUTE_ALREADY_RESOLVED',
              processedAt: now,
            },
          });
          return false;
        }
        const enrollment = await tx.programEnrollment.findFirst({
          where: {
            id: purchase.paidEnrollmentId,
            workspaceId: purchase.workspaceId,
            groupId: purchase.groupId,
          },
          select: { status: true, endsAt: true },
        });
        if (!enrollment) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'FAILED', errorCategory: 'ENROLLMENT_MISMATCH', processedAt: now },
          });
          throw new ApplicationError('FORBIDDEN', 'paid enrollment verification failed');
        }

        let eventType: 'PAYMENT_DISPUTED' | 'PAYMENT_DISPUTE_WON' | 'PAYMENT_CHARGEBACK_LOST';
        if (openDisputeStatuses.has(input.disputeStatus)) {
          if (!['PAID', 'DISPUTED'].includes(purchase.status)) {
            await tx.paymentWebhookEvent.update({
              where: { id: webhook.id },
              data: {
                status: 'IGNORED',
                errorCategory: 'PURCHASE_ALREADY_SETTLED',
                processedAt: now,
              },
            });
            return false;
          }
          await tx.programEnrollment.updateMany({
            where: {
              id: purchase.paidEnrollmentId,
              workspaceId: purchase.workspaceId,
              groupId: purchase.groupId,
              status: { in: ['ACTIVE', 'COMPLETED'] },
            },
            data: { status: 'CANCELLED' },
          });
          await tx.programPurchase.update({
            where: { id: purchase.id },
            data: {
              status: 'DISPUTED',
              providerDisputeId: input.disputeId,
              disputeStatus: input.disputeStatus,
              disputedAmountYen: input.amount,
              disputedAt:
                purchase.providerDisputeId === input.disputeId ? (purchase.disputedAt ?? now) : now,
              disputeResolvedAt: null,
              enrollmentStatusBeforeDispute:
                purchase.providerDisputeId === input.disputeId
                  ? (purchase.enrollmentStatusBeforeDispute ?? enrollment.status)
                  : enrollment.status,
            },
          });
          eventType = 'PAYMENT_DISPUTED';
        } else if (restoredDisputeStatuses.has(input.disputeStatus)) {
          if (purchase.status === 'CHARGEBACK_LOST') {
            await tx.paymentWebhookEvent.update({
              where: { id: webhook.id },
              data: {
                status: 'IGNORED',
                errorCategory: 'CHARGEBACK_ALREADY_LOST',
                processedAt: now,
              },
            });
            return false;
          }
          const priorStatus = purchase.enrollmentStatusBeforeDispute;
          const restoredStatus =
            enrollment.endsAt && enrollment.endsAt <= now
              ? 'EXPIRED'
              : priorStatus === 'COMPLETED'
                ? 'COMPLETED'
                : 'ACTIVE';
          if (purchase.status === 'DISPUTED') {
            await tx.programEnrollment.updateMany({
              where: {
                id: purchase.paidEnrollmentId,
                workspaceId: purchase.workspaceId,
                groupId: purchase.groupId,
                status: 'CANCELLED',
              },
              data: { status: restoredStatus },
            });
          }
          await tx.programPurchase.update({
            where: { id: purchase.id },
            data: {
              status: 'PAID',
              providerDisputeId: input.disputeId,
              disputeStatus: input.disputeStatus,
              disputedAmountYen: 0,
              disputeResolvedAt: now,
            },
          });
          eventType = 'PAYMENT_DISPUTE_WON';
        } else if (input.disputeStatus === 'lost') {
          await tx.programEnrollment.updateMany({
            where: {
              id: purchase.paidEnrollmentId,
              workspaceId: purchase.workspaceId,
              groupId: purchase.groupId,
              status: { in: ['ACTIVE', 'COMPLETED', 'CANCELLED'] },
            },
            data: { status: 'CANCELLED' },
          });
          await tx.programPurchase.update({
            where: { id: purchase.id },
            data: {
              status: 'CHARGEBACK_LOST',
              providerDisputeId: input.disputeId,
              disputeStatus: input.disputeStatus,
              disputedAmountYen: input.amount,
              disputedAt:
                purchase.providerDisputeId === input.disputeId ? (purchase.disputedAt ?? now) : now,
              disputeResolvedAt: now,
              enrollmentStatusBeforeDispute:
                purchase.providerDisputeId === input.disputeId
                  ? (purchase.enrollmentStatusBeforeDispute ?? enrollment.status)
                  : enrollment.status,
            },
          });
          eventType = 'PAYMENT_CHARGEBACK_LOST';
        } else {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: {
              status: 'IGNORED',
              errorCategory: 'UNSUPPORTED_DISPUTE_STATUS',
              processedAt: now,
            },
          });
          return false;
        }
        await tx.programActionEvent.create({
          data: {
            workspaceId: purchase.workspaceId,
            groupId: purchase.groupId,
            programEnrollmentId: purchase.sourceEnrollmentId ?? purchase.paidEnrollmentId,
            eventType,
            sourceResourceType: 'PROGRAM_ENROLLMENT',
            sourceResourceId: purchase.paidEnrollmentId,
            idempotencyKey: `stripe:dispute:${input.providerEventId}`,
            metadata: {
              purchaseId: purchase.id,
              paidEnrollmentId: purchase.paidEnrollmentId,
              providerDisputeId: input.disputeId,
              disputeStatus: input.disputeStatus,
              amountYen: input.amount,
              provider: 'STRIPE',
            },
            actorUserId: purchase.buyerUserId,
            occurredAt: now,
          },
        });
        await tx.paymentWebhookEvent.update({
          where: { id: webhook.id },
          data: { status: 'PROCESSED', errorCategory: null, processedAt: now },
        });
        return true;
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    await recordFailedWebhookEvent(client, input);
    throw error;
  }
}
