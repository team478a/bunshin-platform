import 'server-only';
import { opsMorningDigestDateWindow } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import {
  currentAdminEmailEnvironment,
  AesGcmAdminEmailSecretCrypto,
} from '../email/secure-admin-email-configuration';
import {
  OpsMorningDigestResend,
  OpsMorningDigestSendError,
} from '../email/ops-morning-digest-resend';
import { authorizeCronRequest } from './cron-security';
import { buildOpsMorningDigestContent } from '../admin/ops-morning-digest';

const logger = createLogger();
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
function response(outcome: string, requestId: string, status = 200) {
  return Response.json({ outcome, requestId }, { status, headers });
}

export async function opsMorningDigestCronResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const startedAt = Date.now();
  const route = '/api/internal/ops/morning-digest';
  try {
    const configuration = getServerEnvironment();
    authorizeCronRequest(request, configuration.CRON_SECRET);
    if (request.method !== 'GET') return response('METHOD_NOT_ALLOWED', requestId, 405);
    if (configuration.APP_ENV !== 'production')
      return response('NON_PRODUCTION_DISABLED', requestId);
    if (configuration.OPS_DIGEST_ENABLED !== 'true') return response('DISABLED', requestId);

    const now = new Date();
    const dateWindow = opsMorningDigestDateWindow(now);
    const environment = currentAdminEmailEnvironment();
    const db = await import('@bunshin/database');
    const runs = new db.PrismaOpsMorningDigestRunRepository();
    const currentState = await runs.runState({ environment, targetDate: dateWindow.targetDate });
    if (currentState?.status === 'SENT') return response('ALREADY_SENT', requestId);
    if (currentState?.status === 'FAILED') return response('ALREADY_ATTEMPTED', requestId);
    if (
      currentState?.status === 'CLAIMED' &&
      currentState.leaseExpiresAt &&
      currentState.leaseExpiresAt > now
    )
      return response('ALREADY_RUNNING', requestId, 409);

    const claim = await runs.claim({ environment, targetDate: dateWindow.targetDate, now });
    if (!claim) return response('ALREADY_RUNNING', requestId, 409);

    try {
      const admin = await db.prisma.platformAdmin.findFirst({
        where: { status: 'ACTIVE' },
        select: { userId: true },
      });
      const { report } = await buildOpsMorningDigestContent({
        actorUserId: admin?.userId ?? '',
        now,
      });

      const adminEmail = new db.PrismaAdminEmailConfigurationRepository();
      const stored = await adminEmail.active({ environment });
      let apiKey: string | undefined;
      let from: string | undefined;
      let to: string[] | undefined;
      if (stored) {
        apiKey = new AesGcmAdminEmailSecretCrypto().decrypt(stored.encryptedApiKey);
        from = stored.configuration.fromEmail;
        to = stored.configuration.recipientEmails;
      } else if (!(await adminEmail.hasConfiguration({ environment }))) {
        apiKey = configuration.RESEND_ADMIN_ALERT_API_KEY;
        from = configuration.RESEND_ADMIN_ALERT_FROM;
        to = configuration.RESEND_ADMIN_ALERT_TO?.split(',').map((value) => value.trim());
      }
      if (!apiKey || !from || !to?.length) {
        await runs.markFailed({
          claim,
          errorCategory: 'EMAIL_CONFIGURATION_MISSING',
          failedAt: new Date(),
        });
        return response('EMAIL_CONFIGURATION_MISSING', requestId, 503);
      }

      await new OpsMorningDigestResend().send({
        apiKey,
        from,
        to,
        environment,
        targetDate: dateWindow.targetDate,
        subject: report.subject,
        text: report.body,
      });
      const markedSent = await runs.markSent({ claim, sentAt: new Date() });
      if (!markedSent) {
        logger.error('Operations morning digest send recorded after claim changed', {
          requestId,
          route,
          targetDate: dateWindow.targetDate,
          status: 'SEND_RECORD_CONFLICT',
        });
        return response('SEND_RECORD_CONFLICT', requestId, 503);
      }
      logger.info('Operations morning digest sent', {
        requestId,
        route,
        targetDate: dateWindow.targetDate,
        status: report.status,
        criticalCount: report.criticalCount,
        warningCount: report.warningCount,
        latency: Date.now() - startedAt,
      });
      return response('SENT', requestId);
    } catch (error) {
      const category =
        error instanceof OpsMorningDigestSendError ? error.category : 'COLLECTION_FAILED';
      await runs.markFailed({ claim, errorCategory: category, failedAt: new Date() });
      logger.error('Operations morning digest failed', {
        requestId,
        route,
        targetDate: dateWindow.targetDate,
        status: 'FAILED',
        errorCategory: category,
        latency: Date.now() - startedAt,
      });
      return response(category, requestId, 503);
    }
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('Operations morning digest request rejected', {
      requestId,
      route,
      status: mapped.status,
      latency: Date.now() - startedAt,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
