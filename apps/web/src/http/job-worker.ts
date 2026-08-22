import 'server-only';
import {
  ClaimJob,
  MissionAutomationHandlerRegistry,
  RunJobWorkerBatch,
  type JobEnvironment,
  type JobWorkerSummary,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

const logger = createLogger();
const runtimeEnvironment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const satisfies Record<string, JobEnvironment>;

export interface JobWorkerPort {
  execute(input: {
    environment: JobEnvironment;
    workerId: string;
    batchSize: number;
  }): Promise<JobWorkerSummary>;
}

function sameSecret(presented: string, expected: string) {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

function authorize(request: Request, secret: string | undefined) {
  if (!secret) throw new ApplicationError('CONFIGURATION_ERROR', 'CRON_SECRET is required');
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer '))
    throw new ApplicationError('UNAUTHENTICATED', 'worker authorization required');
  const presented = authorization.slice('Bearer '.length);
  if (!sameSecret(presented, secret))
    throw new ApplicationError('UNAUTHENTICATED', 'worker authorization required');
}

async function configuredWorker(): Promise<JobWorkerPort> {
  const registry = new MissionAutomationHandlerRegistry();
  if (!registry.get('WEEKLY_PLAN_PREPARE') || !registry.get('DAILY_MISSION_GENERATE'))
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      'mission automation handlers are not configured',
    );
  const db = await import('@bunshin/database');
  const jobs = new db.PrismaJobRepository();
  return new RunJobWorkerBatch(
    new ClaimJob(jobs),
    // Both handlers are required above. The concrete executor is connected in Phase 6-E4.
    { execute: () => Promise.reject(new Error('unreachable')) },
  );
}

export async function jobWorkerResponse(
  request: Request,
  workerFactory: () => Promise<JobWorkerPort> = configuredWorker,
): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const environment = getServerEnvironment();
    authorize(request, environment.CRON_SECRET);
    const worker = await workerFactory();
    const result = await worker.execute({
      environment: runtimeEnvironment[environment.APP_ENV],
      workerId: `http-${randomUUID()}`,
      batchSize: 5,
    });
    logger.info('job worker batch complete', {
      requestId,
      route: '/api/internal/jobs/run',
      status: 200,
      latency: Date.now() - started,
      environment: result.environment,
      claimed: result.claimed,
      succeeded: result.succeeded,
      retryScheduled: result.retryScheduled,
      dead: result.dead,
      infrastructureFailures: result.infrastructureFailures,
      drained: result.drained,
    });
    return Response.json({ ...result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('job worker batch failed', {
      requestId,
      route: '/api/internal/jobs/run',
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
