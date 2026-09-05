import 'server-only';
import {
  EnqueueJob,
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
      const [missionResult, trendResult, badgePrepared, personalityResult] = await Promise.all([
        mission.execute(environment),
        trend.execute(environment),
        badgePreparation.execute({ environment }),
        personalityLearning.execute(),
      ]);
      const badgeJobResult = await badgeJobs.execute(environment);
      return {
        ...missionResult,
        trend: trendResult,
        badgeLine: { ...badgePrepared, ...badgeJobResult },
        personalityLearning: personalityResult,
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
