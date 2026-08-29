import 'server-only';
import {
  ClaimJob,
  CompleteJob,
  ExecuteMissionAutomationJob,
  ExecuteLineDeliveryJob,
  ExecuteBadgeLineDeliveryJob,
  ExecuteVideoRenderJob,
  ExecuteSocialImageGenerationJob,
  FailJob,
  MissionAutomationHandlerRegistry,
  RunJobWorkerBatch,
  type JobEnvironment,
  type JobWorkerSummary,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { randomUUID } from 'node:crypto';
import { authorizeCronRequest } from './cron-security';

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

async function configuredWorker(): Promise<JobWorkerPort> {
  const [
    { createWeeklyPlanJobHandler },
    { createDailyMissionJobHandler },
    { createLineDeliveryJobHandler },
    { createBadgeLineDeliveryJobHandler },
    { createTrendResearchJobHandler },
    { createVideoRenderJobHandler },
    { createSocialImageGenerationJobHandler },
  ] = await Promise.all([
    import('../jobs/weekly-plan-job-handler'),
    import('../jobs/daily-mission-job-handler'),
    import('../jobs/line-delivery-job-handler'),
    import('../jobs/badge-line-delivery-job-handler'),
    import('../jobs/trend-research-job-handler'),
    import('../jobs/video-render-job-handler'),
    import('../jobs/social-image-generation-job-handler'),
  ]);
  const registry = new MissionAutomationHandlerRegistry()
    .register('WEEKLY_PLAN_PREPARE', createWeeklyPlanJobHandler())
    .register('DAILY_MISSION_GENERATE', createDailyMissionJobHandler())
    .register('TREND_RESEARCH_REFRESH', createTrendResearchJobHandler());
  const db = await import('@bunshin/database');
  const jobs = new db.PrismaJobRepository();
  const complete = new CompleteJob(jobs);
  const fail = new FailJob(jobs);
  const missionExecutor = new ExecuteMissionAutomationJob(
    new db.PrismaMissionAutomationScopeRepository(),
    registry,
    complete,
    fail,
  );
  const lineExecutor = new ExecuteLineDeliveryJob(createLineDeliveryJobHandler(), complete, fail);
  const badgeLineExecutor = new ExecuteBadgeLineDeliveryJob(
    createBadgeLineDeliveryJobHandler(),
    complete,
    fail,
  );
  const videoExecutor = new ExecuteVideoRenderJob(createVideoRenderJobHandler(), complete, fail);
  const socialImageExecutor = new ExecuteSocialImageGenerationJob(
    createSocialImageGenerationJobHandler(),
    complete,
    fail,
  );
  return new RunJobWorkerBatch(new ClaimJob(jobs), {
    execute: (job, workerId) =>
      job.jobType === 'LINE_MISSION_DELIVER'
        ? lineExecutor.execute(job, workerId)
        : job.jobType === 'BADGE_LINE_DELIVER'
          ? badgeLineExecutor.execute(job, workerId)
          : job.jobType === 'VIDEO_RENDER_PROCESS'
            ? videoExecutor.execute(job, workerId)
            : job.jobType === 'SOCIAL_IMAGE_GENERATE'
              ? socialImageExecutor.execute(job, workerId)
              : missionExecutor.execute(job, workerId),
  });
}

export async function jobWorkerResponse(
  request: Request,
  workerFactory: () => Promise<JobWorkerPort> = configuredWorker,
): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const environment = getServerEnvironment();
    authorizeCronRequest(request, environment.CRON_SECRET);
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
