import 'server-only';
import { createLogger } from '@bunshin/observability';
import {
  AesGcmAdminEmailSecretCrypto,
  currentAdminEmailEnvironment,
} from '../email/secure-admin-email-configuration';
import { CommercialBillingReminderResend } from '../email/commercial-billing-reminder';

const THREE_DAYS = 3 * 24 * 60 * 60 * 1_000;

export type CommercialReminderKind = 'INITIAL' | 'OVERDUE';

export function commercialReminderKind(dueAt: Date, now: Date): CommercialReminderKind | null {
  const remaining = dueAt.getTime() - now.getTime();
  if (remaining <= 0) return 'OVERDUE';
  if (remaining <= THREE_DAYS) return 'INITIAL';
  return null;
}

const actionFor = (kind: CommercialReminderKind) =>
  kind === 'OVERDUE' ? 'OVERDUE_REMINDER_SENT' : 'PAYMENT_GUIDANCE_SENT';

const failureActionFor = (kind: CommercialReminderKind) =>
  kind === 'OVERDUE' ? 'OVERDUE_REMINDER_FAILED' : 'PAYMENT_GUIDANCE_FAILED';

export async function runCommercialBillingReminders(now = new Date()) {
  const db = await import('@bunshin/database');
  const configuration = await new db.PrismaAdminEmailConfigurationRepository().active({
    environment: currentAdminEmailEnvironment(),
  });
  if (!configuration)
    return { configurationReady: false, candidates: 0, sent: 0, skipped: 0, failed: 0 };

  const candidates = await db.prisma.tenantInvoice.findMany({
    where: {
      status: 'ISSUED',
      dueAt: { not: null, lte: new Date(now.getTime() + THREE_DAYS) },
      contract: {
        status: 'ACTIVE',
        automaticRemindersEnabled: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
    },
    orderBy: { dueAt: 'asc' },
    take: 500,
    select: {
      id: true,
      workspaceId: true,
      invoiceNumber: true,
      amountYen: true,
      dueAt: true,
      checkoutUrl: true,
      checkoutExpiresAt: true,
      contract: {
        select: { billingName: true, billingEmail: true, updatedByUserId: true },
      },
    },
  });
  const audits = candidates.length
    ? await db.prisma.commercialBillingAudit.findMany({
        where: {
          entityType: 'INVOICE',
          entityId: { in: candidates.map(({ id }) => id) },
          action: { in: ['PAYMENT_GUIDANCE_SENT', 'OVERDUE_REMINDER_SENT'] },
        },
        select: { entityId: true, action: true },
      })
    : [];
  const sentActions = new Set(audits.map(({ entityId, action }) => `${entityId}:${action}`));
  const apiKey = new AesGcmAdminEmailSecretCrypto().decrypt(configuration.encryptedApiKey);
  const sender = new CommercialBillingReminderResend();
  const logger = createLogger();
  const localDate = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const invoice of candidates) {
    if (!invoice.dueAt) continue;
    const kind = commercialReminderKind(invoice.dueAt, now);
    if (!kind) continue;
    const action = actionFor(kind);
    if (sentActions.has(`${invoice.id}:${action}`)) {
      skipped += 1;
      continue;
    }
    try {
      await sender.send({
        apiKey,
        from: configuration.configuration.fromEmail,
        to: invoice.contract.billingEmail,
        invoiceNumber: invoice.invoiceNumber,
        billingName: invoice.contract.billingName,
        amountYen: invoice.amountYen,
        dueAt: invoice.dueAt,
        checkoutUrl:
          invoice.checkoutUrl && invoice.checkoutExpiresAt && invoice.checkoutExpiresAt > now
            ? invoice.checkoutUrl
            : null,
        overdue: kind === 'OVERDUE',
        idempotencyKey: `commercial-${invoice.id}-${kind}-${localDate}`,
      });
      await db.prisma.commercialBillingAudit.create({
        data: {
          workspaceId: invoice.workspaceId,
          actorUserId: invoice.contract.updatedByUserId,
          entityType: 'INVOICE',
          entityId: invoice.id,
          action,
          afterData: {
            recipient: invoice.contract.billingEmail,
            reminderKind: kind,
            sentAt: now.toISOString(),
            automatic: true,
          },
        },
      });
      sentActions.add(`${invoice.id}:${action}`);
      sent += 1;
    } catch (error) {
      failed += 1;
      logger.error('commercial billing reminder delivery failed', {
        workspaceId: invoice.workspaceId,
        invoiceId: invoice.id,
        reminderKind: kind,
        errorCode: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      });
      try {
        await db.prisma.commercialBillingAudit.create({
          data: {
            workspaceId: invoice.workspaceId,
            actorUserId: invoice.contract.updatedByUserId,
            entityType: 'INVOICE',
            entityId: invoice.id,
            action: failureActionFor(kind),
            afterData: {
              reminderKind: kind,
              attemptedAt: now.toISOString(),
              automatic: true,
            },
          },
        });
      } catch (auditError) {
        logger.error('commercial billing reminder failure audit could not be saved', {
          workspaceId: invoice.workspaceId,
          invoiceId: invoice.id,
          reminderKind: kind,
          errorCode: auditError instanceof Error ? auditError.name : 'UNKNOWN_ERROR',
        });
      }
    }
  }
  return { configurationReady: true, candidates: candidates.length, sent, skipped, failed };
}
