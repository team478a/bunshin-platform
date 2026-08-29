import 'server-only';
import { RunBadgeRewardWorkerBatch, type BadgeRewardWorkerSummary } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { randomUUID } from 'node:crypto';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();

export interface BadgeRewardWorkerPort {
  execute(input: { workerId: string; batchSize: number }): Promise<BadgeRewardWorkerSummary>;
}

const configuredWorker = async (): Promise<BadgeRewardWorkerPort> => {
  const db = await import('@bunshin/database');
  return new RunBadgeRewardWorkerBatch(new db.PrismaBadgeRewardRepository(db.prisma));
};

export async function badgeRewardWorkerResponse(
  request: Request,
  workerFactory: () => Promise<BadgeRewardWorkerPort> = configuredWorker,
): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    authorizeCronRequest(request, getServerEnvironment().CRON_SECRET);
    const result = await (
      await workerFactory()
    ).execute({ workerId: `badge-reward-${randomUUID()}`, batchSize: 5 });
    logger.info('badge reward worker batch complete', {
      requestId,
      route: '/api/internal/badge-rewards/run',
      status: 200,
      latency: Date.now() - started,
      ...result,
    });
    return Response.json({ ...result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('badge reward worker batch failed', {
      requestId,
      route: '/api/internal/badge-rewards/run',
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
