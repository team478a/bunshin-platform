import 'server-only';
import {
  EnqueueJob,
  ProcessCommonBadgeBatch,
  ProcessPointActivityBatch,
  PrepareBadgeLineNotifications,
  RunMissionAutomationScheduler,
  RunTrendResearchScheduler,
  ScheduleDailyMissionGeneration,
  ScheduleWeeklyTrendResearch,
  ScheduleWeeklyPlanPreparation,
  ScheduleBadgeLineDeliveryJobs,
  type JobEnvironment,
  type MissionAutomationScheduleSummary,
  type TrendResearchScheduleSummary,
  GeneratePersonalityLearningProposal,
  RunPersonalityLearningProposalJob,
  RunWeeklyPersonalityLearningScheduler,
  type PersonalityLearningScheduleSummary,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { authorizeCronRequest } from './cron-security';
import {
  scheduleWeeklyReportLineDeliveries,
  type WeeklyReportLineScheduleSummary,
} from '../services/weekly-report-line-scheduler';

const logger = createLogger();
const runtimeEnvironment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const satisfies Record<string, JobEnvironment>;

export interface MissionSchedulerPort {
  execute(environment: JobEnvironment): Promise<
    MissionAutomationScheduleSummary & {
      trend?: TrendResearchScheduleSummary;
      badgeLine?: {
        scanned: number;
        prepared: number;
        skipped: number;
        candidates: number;
        enqueued: number;
        truncated: boolean;
      };
      personalityLearning?: PersonalityLearningScheduleSummary;
      weeklyReportLine?: WeeklyReportLineScheduleSummary;
      incentives?: {
        points: {
          scanned: number;
          GRANTED: number;
          ALREADY_PROCESSED: number;
          NO_ACTIVE_RULE: number;
          NOT_ELIGIBLE: number;
          failures: number;
        };
        badges: {
          scanned: number;
          AWARDED: number;
          PROGRESSED: number;
          ALREADY_PROCESSED: number;
          NO_ACTIVE_BADGE: number;
          NOT_ELIGIBLE: number;
          failures: number;
        };
      };
    }
  >;
}

async function configuredScheduler(): Promise<MissionSchedulerPort> {
  const db = await import('@bunshin/database');
  const jobs = new db.PrismaJobRepository();
  const scopes = new db.PrismaMissionAutomationScopeRepository();
  const mission = new RunMissionAutomationScheduler(
    new db.PrismaMissionAutomationCandidateRepository(),
    new ScheduleWeeklyPlanPreparation(new EnqueueJob(jobs), scopes),
    new ScheduleDailyMissionGeneration(new EnqueueJob(jobs), scopes),
  );
  const trend = new RunTrendResearchScheduler(
    new db.PrismaTrendResearchAutomationCandidateRepository(),
    new ScheduleWeeklyTrendResearch(new EnqueueJob(jobs), scopes),
  );
  const badgePreparation = new PrepareBadgeLineNotifications(
    new db.PrismaBadgeLineNotificationPreparationRepository(db.prisma),
  );
  const pointActivity = new ProcessPointActivityBatch(
    new db.PrismaPointActivityProcessorRepository(db.prisma),
  );
  const badgeActivity = new ProcessCommonBadgeBatch(
    new db.PrismaCommonBadgeProcessorRepository(db.prisma),
  );
  const badgeJobs = new ScheduleBadgeLineDeliveryJobs(
    new db.PrismaBadgeLineJobCandidateRepository(db.prisma),
    new EnqueueJob(jobs),
  );
  const { resolveOpenAiRuntimeConfiguration } =
    await import('../ai/runtime-provider-configuration');
  const { OpenAIPersonalityLearningSuggestion } =
    await import('../providers/openai-personality-learning-suggestion');
  const { recordAiUsageSafely } = await import('../observability/ai-usage');
  return {
    async execute(environment) {
      const personalityLearning = new RunWeeklyPersonalityLearningScheduler({
        async execute() {
          const runtime = await resolveOpenAiRuntimeConfiguration();
          return new RunPersonalityLearningProposalJob(
            new db.PrismaPersonalityLearningCandidateRepository(),
            new GeneratePersonalityLearningProposal(
              new db.PrismaPersonalityLearningProposalRepository(),
              new OpenAIPersonalityLearningSuggestion({
                apiKey: runtime.apiKey,
                model: runtime.model,
                requestCostUsdMicros: runtime.requestCostUsdMicros,
                recordUsage: recordAiUsageSafely,
              }),
            ),
            10,
          ).execute();
        },
      } as RunPersonalityLearningProposalJob);
      const pointProcessing = pointActivity
        .execute({ limit: 50, timezone: 'Asia/Tokyo' })
        .then((result) => ({ ...result, failures: 0 }))
        .catch(() => {
          logger.error('point activity processing failed', {
            route: '/api/internal/jobs/schedule',
            errorCode: 'POINT_ACTIVITY_PROCESSING_FAILED',
          });
          return {
            scanned: 0,
            GRANTED: 0,
            ALREADY_PROCESSED: 0,
            NO_ACTIVE_RULE: 0,
            NOT_ELIGIBLE: 0,
            failures: 1,
          };
        });
      const badgeProcessing = badgeActivity
        .execute({ limit: 50, timezone: 'Asia/Tokyo' })
        .then((result) => ({ ...result, failures: 0 }))
        .catch(() => {
          logger.error('common badge processing failed', {
            route: '/api/internal/jobs/schedule',
            errorCode: 'COMMON_BADGE_PROCESSING_FAILED',
          });
          return {
            scanned: 0,
            AWARDED: 0,
            PROGRESSED: 0,
            ALREADY_PROCESSED: 0,
            NO_ACTIVE_BADGE: 0,
            NOT_ELIGIBLE: 0,
            failures: 1,
          };
        });
      const [missionResult, trendResult, personalityResult, pointResult, badgeResult] =
        await Promise.all([
          mission.execute(environment),
          trend.execute(environment),
          personalityLearning.execute(),
          pointProcessing,
          badgeProcessing,
        ]);
      const badgePrepared = await badgePreparation.execute({ environment });
      const badgeJobResult = await badgeJobs.execute(environment);
      const weeklyReportLine = await scheduleWeeklyReportLineDeliveries({ environment }).catch(
        () => ({ services: 0, due: 0, broadcasts: 0, recipients: 0, skipped: 0, failures: 1 }),
      );
      return {
        ...missionResult,
        trend: trendResult,
        badgeLine: { ...badgePrepared, ...badgeJobResult },
        weeklyReportLine,
        personalityLearning: personalityResult,
        incentives: { points: pointResult, badges: badgeResult },
      };
    },
  };
}

export async function missionSchedulerResponse(
  request: Request,
  schedulerFactory: () => Promise<MissionSchedulerPort> = configuredScheduler,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const configuration = getServerEnvironment();
    authorizeCronRequest(request, configuration.CRON_SECRET);
    const result = await (
      await schedulerFactory()
    ).execute(runtimeEnvironment[configuration.APP_ENV]);
    logger.info('mission automation scheduler complete', {
      requestId,
      route: '/api/internal/jobs/schedule',
      status: 200,
      latency: Date.now() - started,
      ...result,
    });
    return Response.json({ ...result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('mission automation scheduler failed', {
      requestId,
      route: '/api/internal/jobs/schedule',
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
