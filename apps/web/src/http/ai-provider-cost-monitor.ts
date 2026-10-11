import 'server-only';
import { MonitorStaleAiProviderAdmissions } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { ProviderCostAlertResend } from '../ai/provider-cost-alert-resend';
import {
  AesGcmAdminEmailSecretCrypto,
  currentAdminEmailEnvironment,
} from '../email/secure-admin-email-configuration';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();

async function notifier(configuration: ReturnType<typeof getServerEnvironment>) {
  const db = await import('@bunshin/database');
  const repository = new db.PrismaAdminEmailConfigurationRepository();
  const environment = currentAdminEmailEnvironment();
  const stored = await repository.active({ environment });
  if (stored) {
    const crypto = new AesGcmAdminEmailSecretCrypto();
    return new ProviderCostAlertResend({
      apiKey: crypto.decrypt(stored.encryptedApiKey),
      from: stored.configuration.fromEmail,
      to: stored.configuration.recipientEmails,
    });
  }
  if (await repository.hasConfiguration({ environment })) return null;
  if (
    configuration.RESEND_ADMIN_ALERT_API_KEY &&
    configuration.RESEND_ADMIN_ALERT_FROM &&
    configuration.RESEND_ADMIN_ALERT_TO
  )
    return new ProviderCostAlertResend({
      apiKey: configuration.RESEND_ADMIN_ALERT_API_KEY,
      from: configuration.RESEND_ADMIN_ALERT_FROM,
      to: configuration.RESEND_ADMIN_ALERT_TO.split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    });
  return null;
}

export async function aiProviderCostMonitorResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  const route = '/api/internal/ai-provider-cost/monitor';
  try {
    const configuration = getServerEnvironment();
    authorizeCronRequest(request, configuration.CRON_SECRET);
    const db = await import('@bunshin/database');
    const alertPort = await notifier(configuration);
    const result = await new MonitorStaleAiProviderAdmissions(
      new db.PrismaAiProviderConfigurationRepository(),
      alertPort,
    ).execute(currentAdminEmailEnvironment());
    const alertingConfigured = alertPort !== null;
    const operational =
      alertingConfigured ||
      (configuration.APP_ENV !== 'production' && result.assessment.summaries.length === 0);
    const staleAdmissionCount = result.assessment.summaries.reduce(
      (sum, { openCount }) => sum + openCount,
      0,
    );
    const reservedCost = result.assessment.summaries.reduce(
      (sum, { reservedCostUsdMicros: value }) => sum + BigInt(value),
      0n,
    );
    const reservedCostUsdMicros = Number(
      reservedCost > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : reservedCost,
    );
    logger.info('AI provider cost monitor complete', {
      requestId,
      route,
      status: operational ? 200 : 503,
      latency: Date.now() - started,
      environment: result.assessment.environment,
      staleAdmissionCount,
      reservedCostUsdMicros,
      truncated: result.assessment.truncated,
      notified: result.notified,
      recorded: result.recorded,
      alertingConfigured,
      fingerprint: result.assessment.fingerprint,
    });
    return Response.json(
      {
        data: {
          environment: result.assessment.environment,
          summaries: result.assessment.summaries,
          staleAdmissionCount,
          reservedCostUsdMicros,
          truncated: result.assessment.truncated,
          notified: result.notified,
          recorded: result.recorded,
          alertingConfigured,
          fingerprint: result.assessment.fingerprint,
          checkedAt: result.assessment.checkedAt.toISOString(),
        },
        requestId,
      },
      { status: operational ? 200 : 503, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('AI provider cost monitor failed', {
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
