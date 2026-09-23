import 'server-only';
import type { PrismaClient } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import {
  receiveWebhookEvent,
  recordFailedWebhookEvent,
  requireWebhookConfiguration,
} from './program-payment-webhook-events';

export { createDirectProgramCheckout, createProgramCheckout } from './program-purchase-checkout';
export { completePaidProgramPurchase } from './program-purchase-completion';

export async function expireProgramCheckout(
  client: PrismaClient,
  input: {
    configurationId: string;
    providerEventId: string;
    eventType: string;
    payloadDigest: string;
    purchaseId: string;
    checkoutSessionId: string;
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
            id: input.purchaseId,
            workspaceId: configuration.workspaceId,
            paymentConfigurationId: configuration.id,
            providerCheckoutSessionId: input.checkoutSessionId,
          },
        });
        if (!purchase) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'FAILED', errorCategory: 'PURCHASE_MISMATCH', processedAt: new Date() },
          });
          throw new ApplicationError('FORBIDDEN', 'purchase verification failed');
        }
        const now = new Date();
        if (purchase.status === 'CREATED' || purchase.status === 'CHECKOUT_OPEN') {
          await tx.programPurchase.update({
            where: { id: purchase.id },
            data: { status: 'EXPIRED', expiredAt: now },
          });
        }
        await tx.paymentWebhookEvent.update({
          where: { id: webhook.id },
          data: {
            status: ['CREATED', 'CHECKOUT_OPEN', 'EXPIRED'].includes(purchase.status)
              ? 'PROCESSED'
              : 'IGNORED',
            errorCategory: ['CREATED', 'CHECKOUT_OPEN', 'EXPIRED'].includes(purchase.status)
              ? null
              : 'PURCHASE_ALREADY_SETTLED',
            processedAt: now,
          },
        });
        return purchase.status === 'CREATED' || purchase.status === 'CHECKOUT_OPEN';
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    await recordFailedWebhookEvent(client, input);
    throw error;
  }
}

export async function refundPaidProgramPurchase(
  client: PrismaClient,
  input: {
    configurationId: string;
    providerEventId: string;
    eventType: string;
    payloadDigest: string;
    paymentIntentId: string;
    amount: number;
    amountRefunded: number;
    currency: string;
    fullyRefunded: boolean;
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
          purchase.amountYen !== input.amount ||
          input.amountRefunded < 0 ||
          input.amountRefunded > input.amount ||
          purchase.currency.toLowerCase() !== input.currency.toLowerCase()
        ) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'FAILED', errorCategory: 'PURCHASE_MISMATCH', processedAt: new Date() },
          });
          throw new ApplicationError('FORBIDDEN', 'purchase verification failed');
        }
        const isFullRefund = input.fullyRefunded && input.amountRefunded >= purchase.amountYen;
        const refundedAmountYen = Math.max(
          purchase.refundedAmountYen,
          Math.min(input.amountRefunded, purchase.amountYen),
        );
        const now = new Date();
        if (!isFullRefund) {
          await tx.programPurchase.update({
            where: { id: purchase.id },
            data: { refundedAmountYen },
          });
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'IGNORED', errorCategory: 'PARTIAL_REFUND', processedAt: now },
          });
          return false;
        }
        if (purchase.status === 'REFUNDED') {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'PROCESSED', processedAt: now },
          });
          return false;
        }
        if (!['PAID', 'DISPUTED'].includes(purchase.status) || !purchase.paidEnrollmentId) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'FAILED', errorCategory: 'PURCHASE_NOT_PAID', processedAt: now },
          });
          throw new ApplicationError('CONFLICT', 'paid purchase required');
        }
        await tx.programEnrollment.updateMany({
          where: {
            id: purchase.paidEnrollmentId,
            workspaceId: purchase.workspaceId,
            groupId: purchase.groupId,
            status: { in: ['ACTIVE', 'COMPLETED'] },
          },
          data: { status: 'CANCELLED', endsAt: now },
        });
        await tx.programActionEvent.create({
          data: {
            workspaceId: purchase.workspaceId,
            groupId: purchase.groupId,
            programEnrollmentId: purchase.sourceEnrollmentId ?? purchase.paidEnrollmentId,
            eventType: 'PAYMENT_REFUNDED',
            sourceResourceType: 'PROGRAM_ENROLLMENT',
            sourceResourceId: purchase.paidEnrollmentId,
            idempotencyKey: `stripe:refund:${input.providerEventId}`,
            metadata: {
              purchaseId: purchase.id,
              paidEnrollmentId: purchase.paidEnrollmentId,
              amountYen: purchase.amountYen,
              provider: 'STRIPE',
            },
            actorUserId: purchase.buyerUserId,
            occurredAt: now,
          },
        });
        await tx.programPurchase.update({
          where: { id: purchase.id },
          data: {
            status: 'REFUNDED',
            refundedAmountYen: purchase.amountYen,
            refundedAt: now,
          },
        });
        await tx.paymentWebhookEvent.update({
          where: { id: webhook.id },
          data: { status: 'PROCESSED', processedAt: now },
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

export async function expireEndedPaidProgramEnrollments(
  client: PrismaClient,
  now = new Date(),
  limit = 500,
) {
  const purchases = await client.programPurchase.findMany({
    where: {
      status: 'PAID',
      paidEnrollment: { status: 'ACTIVE', endsAt: { lte: now } },
    },
    select: {
      id: true,
      workspaceId: true,
      groupId: true,
      sourceEnrollmentId: true,
      paidEnrollmentId: true,
      buyerUserId: true,
    },
    orderBy: { paidEnrollment: { endsAt: 'asc' } },
    take: limit,
  });
  if (purchases.length === 0) return { expired: 0, remaining: false };
  let expired = 0;
  for (const purchase of purchases) {
    if (!purchase.paidEnrollmentId) continue;
    const changed = await client.$transaction(async (tx) => {
      const update = await tx.programEnrollment.updateMany({
        where: {
          id: purchase.paidEnrollmentId!,
          workspaceId: purchase.workspaceId,
          groupId: purchase.groupId,
          status: 'ACTIVE',
          endsAt: { lte: now },
        },
        data: { status: 'EXPIRED' },
      });
      if (update.count === 0) return false;
      await tx.programActionEvent.create({
        data: {
          workspaceId: purchase.workspaceId,
          groupId: purchase.groupId,
          programEnrollmentId: purchase.sourceEnrollmentId ?? purchase.paidEnrollmentId!,
          eventType: 'PAID_PROGRAM_EXPIRED',
          sourceResourceType: 'PROGRAM_ENROLLMENT',
          sourceResourceId: purchase.paidEnrollmentId!,
          idempotencyKey: `paid-program-expired:${purchase.paidEnrollmentId}`,
          metadata: { purchaseId: purchase.id, paidEnrollmentId: purchase.paidEnrollmentId },
          actorUserId: purchase.buyerUserId,
          occurredAt: now,
        },
      });
      return true;
    });
    if (changed) expired += 1;
  }
  return { expired, remaining: purchases.length === limit };
}
