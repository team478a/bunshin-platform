import 'server-only';
import {
  CheckLineOperationalReadiness,
  type LineOperationalAssessment,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { currentLineEnvironment } from '../line/secure-configuration';
import { LineOperationalAlertWebhook } from '../line/operational-alert-webhook';
import { LineOperationalAlertResend } from '../line/operational-alert-resend';
import { AesGcmAdminEmailSecretCrypto } from '../email/secure-admin-email-configuration';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();

function publicAssessment(value: LineOperationalAssessment) {
  return {
    environment: value.environment,
    ready: value.ready,
    alerts: value.alerts,
    fingerprint: value.fingerprint,
    checkedAt: value.checkedAt.toISOString(),
  };
}

async function checker() {
  const db = await import('@bunshin/database');
  return new CheckLineOperationalReadiness(new db.PrismaLineOperationalSnapshotRepository());
}

async function notifier(configuration: ReturnType<typeof getServerEnvironment>) {
  const db = await import('@bunshin/database');
  const stored = await new db.PrismaAdminEmailConfigurationRepository().active({
    environment: currentLineEnvironment(),
  });
  if (stored) {
    const crypto = new AesGcmAdminEmailSecretCrypto();
    return new LineOperationalAlertResend({
      apiKey: crypto.decrypt(stored.encryptedApiKey),
      from: stored.configuration.fromEmail,
      to: stored.configuration.recipientEmails,
    });
  }
  if (
    configuration.RESEND_ADMIN_ALERT_API_KEY &&
    configuration.RESEND_ADMIN_ALERT_FROM &&
    configuration.RESEND_ADMIN_ALERT_TO
  )
    return new LineOperationalAlertResend({
      apiKey: configuration.RESEND_ADMIN_ALERT_API_KEY,
      from: configuration.RESEND_ADMIN_ALERT_FROM,
      to: configuration.RESEND_ADMIN_ALERT_TO.split(',').map((value) => value.trim()),
    });
  if (!configuration.LINE_ADMIN_ALERT_WEBHOOK_URL) return null;
  return new LineOperationalAlertWebhook({
    url: configuration.LINE_ADMIN_ALERT_WEBHOOK_URL,
    ...(configuration.LINE_ADMIN_ALERT_WEBHOOK_TOKEN
      ? { token: configuration.LINE_ADMIN_ALERT_WEBHOOK_TOKEN }
      : {}),
    allowedHosts: (configuration.LINE_ADMIN_ALERT_WEBHOOK_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((value) => value.trim()),
  });
}

async function respond(request: Request, sendAlerts: boolean): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  const route = sendAlerts ? '/api/internal/line/monitor' : '/api/internal/line/readiness';
  try {
    const configuration = getServerEnvironment();
    authorizeCronRequest(request, configuration.CRON_SECRET);
    const useCase = await checker();
    const result = await useCase.execute(currentLineEnvironment());
    const alertPort =
      sendAlerts || configuration.APP_ENV === 'production' ? await notifier(configuration) : null;
    if (sendAlerts && result.alerts.length > 0 && alertPort) await alertPort.notify(result);
    const alertingConfigured = alertPort !== null;
    const operational =
      result.ready && (configuration.APP_ENV !== 'production' || alertingConfigured);
    logger.info('LINE operational check complete', {
      requestId,
      route,
      status: operational ? 200 : 503,
      latency: Date.now() - started,
      environment: result.environment,
      ready: result.ready,
      alertCount: result.alerts.length,
      alertingConfigured,
      fingerprint: result.fingerprint,
    });
    return Response.json(
      { data: { ...publicAssessment(result), alertingConfigured }, requestId },
      { status: operational ? 200 : 503, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('LINE operational check failed', {
      requestId,
      route,
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export const lineOperationalReadinessResponse = (request: Request) => respond(request, false);
export const lineOperationalMonitorResponse = (request: Request) => respond(request, true);
