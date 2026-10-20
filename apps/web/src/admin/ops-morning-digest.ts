import 'server-only';
import {
  GetAdminAlerts,
  buildOpsMorningDigest,
  opsMorningDigestDateWindow,
  type OpsMorningDigestAlert,
  type OpsMorningDigestBroadcastCount,
  type OpsMorningDigestCollectorResult,
  type OpsMorningDigestInvoiceCount,
  type OpsMorningDigestPreviousDelivery,
  type OpsMorningDigestReport,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import {
  currentAdminEmailEnvironment,
  AesGcmAdminEmailSecretCrypto,
} from '../email/secure-admin-email-configuration';

const unavailable = {
  status: 'UNAVAILABLE',
  errorCategory: 'ALERT_CENTER_UNAVAILABLE',
} as const;

function previousDate(targetDate: string) {
  const date = new Date(`${targetDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function unavailableRead<T>(): OpsMorningDigestCollectorResult<T> {
  return { status: 'UNAVAILABLE', errorCategory: 'DATABASE_READ_FAILED' };
}

export interface OpsMorningDigestContent {
  targetDate: string;
  report: OpsMorningDigestReport;
  previousDelivery: OpsMorningDigestPreviousDelivery;
  historyAvailable: boolean;
}

/** Shared read-and-build path for the scheduled sender and the admin-only preview. */
export async function buildOpsMorningDigestContent(input: {
  actorUserId: string | null;
  now: Date;
  tolerateReadFailures?: boolean;
}): Promise<OpsMorningDigestContent> {
  const environment = currentAdminEmailEnvironment();
  const configuration = getServerEnvironment();
  const dateWindow = opsMorningDigestDateWindow(input.now);
  const db = await import('@bunshin/database');

  let alerts: OpsMorningDigestCollectorResult<OpsMorningDigestAlert[]> = unavailable;
  if (input.actorUserId) {
    try {
      const center = await new GetAdminAlerts(new db.PrismaAdminAlertRepository()).execute({
        actorUserId: input.actorUserId,
        environment,
        now: input.now,
      });
      alerts = {
        status: 'OK',
        value: center.alerts.map(({ code, severity, title, count, href }) => ({
          code,
          severity,
          title,
          count,
          href,
        })),
      };
    } catch {
      alerts = unavailable;
    }
  }

  const collector = new db.PrismaOpsMorningDigestCollector();
  const runs = new db.PrismaOpsMorningDigestRunRepository();
  let serviceBroadcasts: OpsMorningDigestCollectorResult<OpsMorningDigestBroadcastCount[]>;
  let fortuneWeeklyBroadcasts: OpsMorningDigestCollectorResult<OpsMorningDigestBroadcastCount[]>;
  let missingBroadcastDateCount: OpsMorningDigestCollectorResult<number>;
  let invoices: OpsMorningDigestCollectorResult<OpsMorningDigestInvoiceCount[]>;
  let previousDelivery: OpsMorningDigestPreviousDelivery;
  let historyAvailable = true;

  if (input.tolerateReadFailures) {
    const [broadcastsResult, invoicesResult, deliveryResult] = await Promise.all([
      collector.serviceLineBroadcasts(dateWindow).catch(() => null),
      collector.tenantInvoiceStatuses().catch(() => null),
      runs
        .deliveryStatus({ environment, targetDate: previousDate(dateWindow.targetDate) })
        .catch(() => null),
    ]);
    serviceBroadcasts = broadcastsResult?.serviceBroadcasts ?? unavailableRead();
    fortuneWeeklyBroadcasts = broadcastsResult?.fortuneWeeklyBroadcasts ?? unavailableRead();
    missingBroadcastDateCount = broadcastsResult?.missingBroadcastDateCount ?? unavailableRead();
    invoices = invoicesResult ?? unavailableRead();
    previousDelivery = deliveryResult ?? 'UNKNOWN';
    historyAvailable = deliveryResult !== null;
  } else {
    const [broadcastsResult, invoicesResult, deliveryResult] = await Promise.all([
      collector.serviceLineBroadcasts(dateWindow),
      collector.tenantInvoiceStatuses(),
      runs.deliveryStatus({ environment, targetDate: previousDate(dateWindow.targetDate) }),
    ]);
    serviceBroadcasts = broadcastsResult.serviceBroadcasts;
    fortuneWeeklyBroadcasts = broadcastsResult.fortuneWeeklyBroadcasts;
    missingBroadcastDateCount = broadcastsResult.missingBroadcastDateCount;
    invoices = invoicesResult;
    previousDelivery = deliveryResult;
  }

  return {
    targetDate: dateWindow.targetDate,
    previousDelivery,
    historyAvailable,
    report: buildOpsMorningDigest({
      targetDate: dateWindow.targetDate,
      alerts,
      serviceBroadcasts,
      fortuneWeeklyBroadcasts,
      missingBroadcastDateCount,
      invoices,
      previousDelivery,
      appUrl: configuration.APP_URL,
    }),
  };
}

export interface OpsMorningDigestEmailReadiness {
  status: 'READY' | 'MISSING' | 'UNKNOWN';
  recipientCount: number | null;
}

/** Checks readiness without returning the secret, sender address, or recipient addresses. */
export async function readOpsMorningDigestEmailReadiness(): Promise<OpsMorningDigestEmailReadiness> {
  const db = await import('@bunshin/database');
  const environment = currentAdminEmailEnvironment();
  const repository = new db.PrismaAdminEmailConfigurationRepository();
  let stored: Awaited<ReturnType<typeof repository.active>>;
  let hasConfiguration: boolean;
  try {
    stored = await repository.active({ environment });
    hasConfiguration = stored ? true : await repository.hasConfiguration({ environment });
  } catch {
    return { status: 'UNKNOWN', recipientCount: null };
  }

  let apiKey: string | undefined;
  let from: string | undefined;
  let recipients: string[] | undefined;
  if (stored) {
    try {
      apiKey = new AesGcmAdminEmailSecretCrypto().decrypt(stored.encryptedApiKey);
      from = stored.configuration.fromEmail;
      recipients = stored.configuration.recipientEmails;
    } catch {
      return { status: 'MISSING', recipientCount: 0 };
    }
  } else if (!hasConfiguration) {
    const configuration = getServerEnvironment();
    apiKey = configuration.RESEND_ADMIN_ALERT_API_KEY;
    from = configuration.RESEND_ADMIN_ALERT_FROM;
    recipients = configuration.RESEND_ADMIN_ALERT_TO?.split(',').map((value) => value.trim());
  }

  const validRecipients = recipients?.filter(Boolean) ?? [];
  const ready = Boolean(apiKey?.trim() && from?.trim() && validRecipients.length > 0);
  return { status: ready ? 'READY' : 'MISSING', recipientCount: validRecipients.length };
}
