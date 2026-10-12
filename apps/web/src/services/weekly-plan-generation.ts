import 'server-only';
import {
  GetBunshin,
  ListGrantedKnowledgeForBunshin,
  RequireActiveBunshinCapability,
  type BunshinCapabilityAssignmentRepository,
  type BunshinRepository,
  type KnowledgeGrantRepository,
  type AiProviderRuntimeAdmission,
  CampaignService,
  type CampaignRepository,
} from '@bunshin/application';
import {
  CreateGeneratedWeeklyPlan,
  GenerateWeeklyPlan,
  ListContentPillars,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListWeeklyPlans,
  type ContentPillarRepository,
  type SocialAccountStrategyRepository,
  type SocialAccountStrategyGoal,
  type SocialProfileRepository,
  type WeeklyPlannerInput,
  type WeeklyPlannerOutput,
  type WeeklyPlannerPort,
  type WeeklyPlanRepository,
  weeklySocialGoalPlanningProfile,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { createLogger } from '@bunshin/observability';
import {
  reserveOpenAiRuntimeConfiguration,
  settleProviderRuntimeAdmission,
} from '../ai/runtime-provider-configuration';
import { recordAiUsage, recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import {
  BUSINESS_OUTCOME_KEYS,
  emptyBusinessOutcomes,
  readBusinessOutcomes,
  sumBusinessOutcomes,
  type BusinessOutcomes,
} from './business-outcomes';
import {
  buildPostPerformancePlanningContext,
  readPostPerformance,
  type PostPerformanceView,
} from './post-performance';
import {
  readSnapshotStrategyGoal,
  readSocialGoalOutcome,
  summarizeSocialGoalOutcomes,
} from './social-goal-outcomes';
export { readSnapshotStrategyGoal } from './social-goal-outcomes';
import {
  OpenAIWeeklyPlanner,
  WEEKLY_PLANNER_PROMPT_VERSION,
} from '../providers/openai-weekly-planner';

interface Scope {
  workspaceId: string;
  groupId?: string | null;
  bunshinId: string;
  actorUserId: string;
}

interface UsageEvent {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  taskType: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: 'SUCCESS' | 'FAILED';
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  errorCode?: string;
  estimatedCostUsdMicros: number;
  pricingVersion: string;
  idempotencyKey: string;
}

interface WeeklyPlanProviderRuntime {
  planner: WeeklyPlannerPort;
  model: string;
  requestCostUsdMicros: number;
  admission: AiProviderRuntimeAdmission | null;
}

interface RecentOutcomeRecord {
  topic: string;
  manualMetrics: unknown;
  strategyGoal?: string | null;
}

const primaryOutcomeKeysByGoal = {
  FOLLOWERS: [],
  LINE_REGISTRATION: [],
  INQUIRY: ['inquiries'],
  VISIT_RESERVATION: ['reservations', 'visits'],
  SALES: ['orders'],
  RECRUIT: [],
  REPEAT: ['repeatReservations', 'repeatVisits'],
  BRAND_AWARENESS: [],
  TRUST_EXPERTISE: [],
  BLOG_TRAFFIC: [],
  OTHER: [],
} as const satisfies Record<SocialAccountStrategyGoal, readonly (keyof BusinessOutcomes)[]>;

function hasRecordedBusinessOutcomes(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const nested = (value as Record<string, unknown>)['businessOutcomes'];
  return Boolean(nested && typeof nested === 'object' && !Array.isArray(nested));
}

export function buildBusinessOutcomePlanningContext(records: RecentOutcomeRecord[]) {
  const topics = new Map<string, BusinessOutcomes>();
  for (const record of records) {
    const outcomes = readBusinessOutcomes(record.manualMetrics);
    if (BUSINESS_OUTCOME_KEYS.every((key) => outcomes[key] === 0)) continue;
    const current = topics.get(record.topic) ?? emptyBusinessOutcomes();
    for (const key of BUSINESS_OUTCOME_KEYS) current[key] += outcomes[key];
    topics.set(record.topic, current);
  }
  const successfulTopics = [...topics.entries()]
    .map(([topic, businessOutcomes]) => ({
      topic,
      businessOutcomes,
      outcomeTotal: BUSINESS_OUTCOME_KEYS.reduce((total, key) => total + businessOutcomes[key], 0),
    }))
    .sort(
      (left, right) =>
        right.outcomeTotal - left.outcomeTotal || left.topic.localeCompare(right.topic, 'ja'),
    )
    .slice(0, 3);
  return {
    businessOutcomes: sumBusinessOutcomes(records.map(({ manualMetrics }) => manualMetrics)),
    successfulTopics,
  };
}

export function buildGoalOutcomePlanningContext(
  goal: SocialAccountStrategyGoal,
  records: RecentOutcomeRecord[],
) {
  const primaryOutcomeKeys = [...primaryOutcomeKeysByGoal[goal]];
  const goalReports = records.filter((record) => {
    const outcome = readSocialGoalOutcome(record.manualMetrics);
    return record.strategyGoal === goal && outcome?.strategyGoal === goal;
  });
  const reportedProgress = summarizeSocialGoalOutcomes(
    goalReports.map(({ manualMetrics }) => manualMetrics),
  );
  const reportedPositiveTopics = goalReports
    .flatMap(({ topic, manualMetrics }) => {
      const result = readSocialGoalOutcome(manualMetrics)?.result;
      return result === 'ACHIEVED' || result === 'SOME_PROGRESS' ? [{ topic, result }] : [];
    })
    .slice(0, 3);
  const recorded = records.filter(
    (record) =>
      primaryOutcomeKeys.length > 0 &&
      record.strategyGoal === goal &&
      hasRecordedBusinessOutcomes(record.manualMetrics),
  );
  const selected = recorded.map((record) => {
    const outcomes = readBusinessOutcomes(record.manualMetrics);
    const relevant = emptyBusinessOutcomes();
    for (const key of primaryOutcomeKeys) relevant[key] = outcomes[key];
    return { topic: record.topic, manualMetrics: { businessOutcomes: relevant } };
  });
  const planning = buildBusinessOutcomePlanningContext(selected);
  const recordedPostCount = records.filter((record) => {
    const outcome = readSocialGoalOutcome(record.manualMetrics);
    return (
      record.strategyGoal === goal &&
      (hasRecordedBusinessOutcomes(record.manualMetrics) || outcome?.strategyGoal === goal)
    );
  }).length;
  return {
    ...planning,
    goalEvaluation: {
      goal,
      status:
        recorded.length > 0
          ? ('MEASURED' as const)
          : goalReports.length > 0
            ? ('SELF_REPORTED' as const)
            : ('NO_DATA' as const),
      primaryOutcomeKeys,
      recordedPostCount,
      primaryOutcomeTotal: primaryOutcomeKeys.reduce(
        (total, key) => total + planning.businessOutcomes[key],
        0,
      ),
      reportedProgress,
      reportedPositiveTopics,
      feedbackMeaning: 'CONTENT_PREFERENCE_NOT_GOAL_ACHIEVEMENT' as const,
      limitations: [
        '同じGoalで生成され、本人が記録した投稿成果だけを集計します。',
        '目的への手応えは本人の自己申告であり、外部KPIや投稿との因果関係を証明しません。',
        ...(primaryOutcomeKeys.length === 0
          ? ['このGoalを直接確認する外部KPIは現在取得していません。']
          : []),
        '記録された件数は投稿との因果関係を証明しません。',
      ],
    },
  };
}

export interface WeeklyPlanGenerationDependencies {
  assignments: BunshinCapabilityAssignmentRepository;
  plans: WeeklyPlanRepository;
  pillars: ContentPillarRepository;
  profiles: SocialProfileRepository;
  strategies: SocialAccountStrategyRepository;
  bunshins: BunshinRepository;
  knowledge: KnowledgeGrantRepository;
  campaigns?: CampaignRepository;
  reserveProviderRuntime(operationKey: string): Promise<WeeklyPlanProviderRuntime>;
  settleProviderRuntime(admission: AiProviderRuntimeAdmission): Promise<void>;
  resolveTimezone(scope: Scope): Promise<string | null>;
  loadRecentPerformance?(
    scope: Scope & { goal: SocialAccountStrategyGoal },
  ): Promise<NonNullable<WeeklyPlannerInput['recentPerformance']>>;
  recordUsage(event: UsageEvent): Promise<void>;
  recordUsageStrict(event: UsageEvent): Promise<void>;
  runWithQuota<T>(input: {
    workspaceId: string;
    groupId?: string | null;
    operationKey: string;
    generate(): Promise<T>;
  }): Promise<T>;
  now(): number;
}

export class WeeklyPlanGenerationService {
  constructor(private readonly dependencies: WeeklyPlanGenerationDependencies) {}

  async execute(
    input: Scope & {
      weekStartDate: string;
      timezone?: string;
      socialProfileId?: string;
      usageIdempotencyKey: string;
      existingPolicy: 'RETURN' | 'CONFLICT';
      includeGrantedKnowledge?: boolean;
      includeCampaigns?: boolean;
      additionalKnowledge?: Array<{ type: string; title: string; content: string }>;
      transformGeneratedOutput?: (output: WeeklyPlannerOutput) => WeeklyPlannerOutput;
      businessContentSchedule?: WeeklyPlannerInput['businessContentSchedule'];
    },
  ) {
    const started = this.dependencies.now();
    let providerAttempted = false;
    let usagePersistenceStarted = false;
    let runtime: WeeklyPlanProviderRuntime | null = null;
    let stage = 'PRECONDITIONS';
    try {
      await new RequireActiveBunshinCapability(this.dependencies.assignments).execute({
        ...input,
        capabilityType: 'SOCIAL',
      });
      const existingPlans = await new ListWeeklyPlans(this.dependencies.plans).execute(input);
      const existing = existingPlans.find(
        ({ weekStartDate }) => weekStartDate === input.weekStartDate,
      );
      if (existing) {
        if (input.existingPolicy === 'RETURN') {
          const values = await new ListContentPillars(this.dependencies.pillars).execute(input);
          return { plan: existing, titles: new Map(values.map(({ id, title }) => [id, title])) };
        }
        throw new ApplicationError('CONFLICT', 'weekly plan already exists');
      }
      const pillars = await new ListContentPillars(this.dependencies.pillars).execute(input);
      const activePillars = pillars.filter(({ active }) => active);
      if (activePillars.length === 0)
        throw new ApplicationError('CONFLICT', 'active content pillar is required');
      const profileValues = await new ListSocialProfiles(this.dependencies.profiles).execute(input);
      const profile = input.socialProfileId
        ? profileValues.find(
            ({ id, status }) => id === input.socialProfileId && status === 'ACTIVE',
          )
        : profileValues.find(({ status }) => status === 'ACTIVE');
      if (!profile) throw new ApplicationError('NOT_FOUND', 'active social profile not found');
      const strategies = await new ListSocialAccountStrategies(
        this.dependencies.strategies,
      ).execute({ ...input, socialProfileId: profile.id });
      const strategy = strategies.find(({ status }) => status === 'APPROVED');
      if (!strategy) throw new ApplicationError('CONFLICT', 'approved strategy is required');
      const timezone = input.timezone ?? (await this.dependencies.resolveTimezone(input));
      if (!timezone) throw new ApplicationError('CONFIGURATION_ERROR', 'timezone is required');
      const bunshin = await new GetBunshin(this.dependencies.bunshins).execute(input);
      const granted =
        input.includeGrantedKnowledge === false
          ? []
          : await new ListGrantedKnowledgeForBunshin(this.dependencies.knowledge).execute(input);
      const weekEnd = new Date(`${input.weekStartDate}T23:59:59.999Z`);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      stage = 'CAMPAIGN_CONTEXT';
      const campaigns =
        input.includeCampaigns !== false && this.dependencies.campaigns
          ? await new CampaignService(this.dependencies.campaigns).listPlanningContexts({
              ...input,
              from: new Date(`${input.weekStartDate}T00:00:00.000Z`),
              to: weekEnd,
            })
          : [];
      stage = 'RECENT_PERFORMANCE';
      const recentPerformance = await this.dependencies.loadRecentPerformance?.({
        ...input,
        goal: strategy.goal,
      });
      stage = 'AI_ADMISSION';
      const admittedRuntime = await this.dependencies.reserveProviderRuntime(
        input.usageIdempotencyKey,
      );
      runtime = admittedRuntime;
      stage = 'AI_GENERATION';
      const result = await this.dependencies.runWithQuota({
        workspaceId: input.workspaceId,
        ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
        operationKey: input.usageIdempotencyKey,
        generate: () =>
          new GenerateWeeklyPlan({
            generate(plannerInput) {
              providerAttempted = true;
              return admittedRuntime.planner.generate(plannerInput);
            },
          }).execute({
            weekStartDate: input.weekStartDate,
            timezone,
            platform: profile.platform,
            availableMinutes: strategy.availableMinutes,
            bunshin: {
              name: bunshin.name,
              objectiveSummary: bunshin.objectiveSummary,
              audienceSummary: bunshin.audienceSummary,
              personalitySummary: bunshin.personalitySummary,
            },
            approvedStrategy: {
              goal: strategy.goal,
              goalPlanning: weeklySocialGoalPlanningProfile(strategy.goal),
              concept: strategy.concept,
              positioning: strategy.positioning,
              targetSummary: strategy.targetSummary,
              ctaStrategy: strategy.ctaStrategy,
              postingPolicy: strategy.postingPolicy,
            },
            contentPillars: activePillars.map(({ id, title, description, weight }) => ({
              id,
              title,
              description,
              weight,
            })),
            grantedKnowledge: [
              ...granted.map(({ type, title, content }) => ({ type, title, content })),
              ...(input.additionalKnowledge ?? []),
            ],
            campaigns,
            recentPlanTopics: existingPlans.slice(0, 4).flatMap((plan) =>
              plan.items.map(({ goal, angle }) => ({
                weekStartDate: plan.weekStartDate,
                goal,
                angle,
              })),
            ),
            ...(recentPerformance ? { recentPerformance } : {}),
            ...(input.businessContentSchedule
              ? { businessContentSchedule: input.businessContentSchedule }
              : {}),
          }),
      });
      const generatedOutput = input.transformGeneratedOutput
        ? input.transformGeneratedOutput(result.output)
        : result.output;
      stage = 'SAVE_PLAN';
      const plan = await new CreateGeneratedWeeklyPlan(
        this.dependencies.plans,
        this.dependencies.assignments,
      ).execute({
        ...input,
        socialProfileId: profile.id,
        strategyId: strategy.id,
        strategyGoal: strategy.goal,
        weekStartDate: input.weekStartDate,
        timezone,
        ...generatedOutput,
      });
      const successUsage = {
        ...input,
        taskType: 'WEEKLY_PLANNER',
        provider: 'openai',
        model: result.model,
        promptVersion: result.promptVersion,
        status: 'SUCCESS',
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        latencyMs: result.latencyMs,
        estimatedCostUsdMicros: runtime.requestCostUsdMicros,
        pricingVersion: 'admin-request-cost-v1',
        idempotencyKey: input.usageIdempotencyKey,
      } as const;
      usagePersistenceStarted = true;
      if (runtime.admission) await this.dependencies.recordUsageStrict(successUsage);
      else await this.dependencies.recordUsage(successUsage);
      if (runtime.admission) await this.dependencies.settleProviderRuntime(runtime.admission);
      return { plan, titles: new Map(pillars.map(({ id, title }) => [id, title])) };
    } catch (error) {
      createLogger().warn('weekly plan generation failed', {
        correlationId: input.usageIdempotencyKey,
        stage,
        errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      if (runtime && !usagePersistenceStarted) {
        const failedUsage = {
          ...input,
          taskType: 'WEEKLY_PLANNER',
          provider: 'openai',
          model: runtime.model,
          promptVersion: WEEKLY_PLANNER_PROMPT_VERSION,
          status: 'FAILED',
          inputTokens: null,
          outputTokens: null,
          latencyMs: this.dependencies.now() - started,
          estimatedCostUsdMicros: providerAttempted ? runtime.requestCostUsdMicros : 0,
          pricingVersion: 'admin-request-cost-v1',
          errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
          idempotencyKey: input.usageIdempotencyKey,
        } as const;
        usagePersistenceStarted = true;
        if (runtime.admission) await this.dependencies.recordUsageStrict(failedUsage);
        else await this.dependencies.recordUsage(failedUsage);
        if (runtime.admission) await this.dependencies.settleProviderRuntime(runtime.admission);
      }
      throw error;
    }
  }
}

export async function createWeeklyPlanGenerationService() {
  const db = await import('@bunshin/database');
  const preferences = new db.PrismaLineNotificationPreferenceRepository();
  return new WeeklyPlanGenerationService({
    assignments: new db.PrismaBunshinCapabilityAssignmentRepository(),
    plans: new db.PrismaWeeklyPlanRepository(),
    pillars: new db.PrismaContentPillarRepository(),
    profiles: new db.PrismaSocialProfileRepository(),
    strategies: new db.PrismaSocialAccountStrategyRepository(),
    bunshins: new db.PrismaBunshinRepository(),
    knowledge: new db.PrismaKnowledgeGrantRepository(),
    campaigns: new db.PrismaCampaignRepository(),
    async reserveProviderRuntime(operationKey) {
      const runtime = await reserveOpenAiRuntimeConfiguration(
        operationKey,
        undefined,
        'SOCIAL_PLANNER',
      );
      return {
        planner: new OpenAIWeeklyPlanner({ apiKey: runtime.apiKey, model: runtime.model }),
        model: runtime.model,
        requestCostUsdMicros: runtime.requestCostUsdMicros,
        admission: runtime.admission,
      };
    },
    settleProviderRuntime: settleProviderRuntimeAdmission,
    async resolveTimezone(scope) {
      const value = await preferences.getScoped(scope);
      if (!value.accessible)
        throw new ApplicationError('NOT_FOUND', 'notification preference scope not found');
      return value.preference?.timezone ?? 'Asia/Tokyo';
    },
    async loadRecentPerformance(scope) {
      const since = new Date(Date.now() - 28 * 86_400_000);
      const missions = await db.prisma.dailyMission.findMany({
        where: {
          workspaceId: scope.workspaceId,
          bunshinId: scope.bunshinId,
          bunshin: {
            ownerUserId: scope.actorUserId,
            groupId: scope.groupId ?? null,
            status: { not: 'ARCHIVED' },
          },
          postRecord: { is: { postedAt: { gte: since } } },
        },
        select: {
          format: true,
          topic: true,
          feedback: { select: { rating: true } },
          postRecord: { select: { manualMetrics: true, postedAt: true } },
          generationContext: { select: { payload: true } },
        },
      });
      const formats = [...new Set(missions.map(({ format }) => format))].sort().map((format) => {
        const values = missions.filter((mission) => mission.format === format);
        return {
          format,
          postedCount: values.length,
          goodFeedbackCount: values.filter(({ feedback }) => feedback?.rating === 'GOOD').length,
          badFeedbackCount: values.filter(({ feedback }) => feedback?.rating === 'BAD').length,
        };
      });
      const postPerformance = buildPostPerformancePlanningContext(
        missions.flatMap(({ topic, postRecord }, index) => {
          const performance = readPostPerformance(postRecord?.manualMetrics);
          return performance && postRecord
            ? [
                {
                  dailyMissionId: `recent-${index}`,
                  topic,
                  postedAt: postRecord.postedAt.toISOString(),
                  ...performance,
                } satisfies PostPerformanceView,
              ]
            : [];
        }),
      );
      return {
        periodDays: 28,
        postedCount: missions.length,
        feedback: {
          good: missions.filter(({ feedback }) => feedback?.rating === 'GOOD').length,
          neutral: missions.filter(({ feedback }) => feedback?.rating === 'NEUTRAL').length,
          bad: missions.filter(({ feedback }) => feedback?.rating === 'BAD').length,
        },
        formats,
        ...buildGoalOutcomePlanningContext(
          scope.goal,
          missions.map(({ topic, postRecord, generationContext }) => ({
            topic,
            manualMetrics: postRecord?.manualMetrics,
            strategyGoal: readSnapshotStrategyGoal(generationContext?.payload),
          })),
        ),
        postPerformance,
      };
    },
    recordUsage: recordAiUsageSafely,
    recordUsageStrict: recordAiUsage,
    runWithQuota: withOrganizationAiGenerationQuota,
    now: Date.now,
  });
}
