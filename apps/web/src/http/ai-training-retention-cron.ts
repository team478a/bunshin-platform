import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();
const scopeSchema = z
  .object({
    workspaceId: z.uuid(),
    groupId: z.uuid(),
    serviceProgramId: z.uuid(),
  })
  .strict();
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

function configuredScopes(raw: string | undefined) {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ApplicationError('CONFIGURATION_ERROR', 'retention scope configuration is invalid');
  }
  const parsed = z.array(scopeSchema).min(1).max(20).safeParse(value);
  if (!parsed.success)
    throw new ApplicationError('CONFIGURATION_ERROR', 'retention scope configuration is invalid');
  const keys = parsed.data.map(
    ({ workspaceId, groupId, serviceProgramId }) => `${workspaceId}:${groupId}:${serviceProgramId}`,
  );
  if (new Set(keys).size !== keys.length)
    throw new ApplicationError('CONFIGURATION_ERROR', 'retention scope configuration is invalid');
  return parsed.data;
}

export async function trainingRetentionCronResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const environment = getServerEnvironment();
    authorizeCronRequest(request, environment.CRON_SECRET);
    if (request.method !== 'GET')
      return Response.json({ requestId }, { status: 405, headers: { ...headers, allow: 'GET' } });

    const scopes = configuredScopes(process.env.PERSONAL_LEARNING_RETENTION_SCOPES);
    if (scopes.length === 0) {
      logger.info('AI training retention cron is not configured; no data scanned', {
        requestId,
        route: '/api/internal/ai-training/retention-cron',
        mode: 'PREVIEW',
        scopeCount: 0,
      });
      return Response.json({ outcome: 'NOT_CONFIGURED', mode: 'PREVIEW', requestId }, { headers });
    }
    const operatorUserId = z
      .uuid()
      .safeParse(process.env.PERSONAL_LEARNING_RETENTION_OPERATOR_USER_ID);
    if (!operatorUserId.success)
      return Response.json({ outcome: 'CONFIGURATION_ERROR', requestId }, { status: 503, headers });

    const executeEnabled =
      environment.APP_ENV === 'production' &&
      process.env.PERSONAL_LEARNING_RETENTION_EXECUTION_ENABLED === 'true';
    const { PrismaTrainingRetentionCronRepository } = await import('@bunshin/database');
    const result = await new PrismaTrainingRetentionCronRepository().run({
      scopes,
      operatorUserId: operatorUserId.data,
      now: new Date(),
      executeEnabled,
    });
    const status =
      result.outcome === 'NOT_FOUND' || result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'TOO_LARGE'
          ? 413
          : result.outcome === 'ALREADY_RUNNING'
            ? 409
            : result.outcome === 'CONFLICT' || result.outcome === 'VERIFY_FAILED'
              ? 409
              : result.outcome === 'TIME_BUDGET_EXHAUSTED'
                ? 503
                : 200;
    logger.info('AI training retention cron completed', {
      requestId,
      route: '/api/internal/ai-training/retention-cron',
      status,
      latency: Date.now() - started,
      mode: executeEnabled ? 'EXECUTE' : 'PREVIEW',
      scopeCount: scopes.length,
      outcome: result.outcome,
      ...(result.outcome === 'PREVIEW' || result.outcome === 'APPLIED'
        ? { enrollments: result.enrollments, counts: result.counts }
        : {}),
    });
    return Response.json(
      { ...result, mode: executeEnabled ? 'EXECUTE' : 'PREVIEW', requestId },
      { status, headers },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('AI training retention cron failed', {
      requestId,
      route: '/api/internal/ai-training/retention-cron',
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
