import 'server-only';
import {
  GetBunshin,
  ListGrantedKnowledgeForBunshin,
  RequireActiveBunshinCapability,
  type BunshinCapabilityAssignmentRepository,
  type BunshinRepository,
  type KnowledgeGrantRepository,
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
  type SocialProfileRepository,
  type WeeklyPlannerPort,
  type WeeklyPlanRepository,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
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
  idempotencyKey: string;
}

export interface WeeklyPlanGenerationDependencies {
  assignments: BunshinCapabilityAssignmentRepository;
  plans: WeeklyPlanRepository;
  pillars: ContentPillarRepository;
  profiles: SocialProfileRepository;
  strategies: SocialAccountStrategyRepository;
  bunshins: BunshinRepository;
  knowledge: KnowledgeGrantRepository;
  planner: WeeklyPlannerPort;
  campaigns?: CampaignRepository;
  providerModel: string;
  resolveTimezone(scope: Scope): Promise<string | null>;
  recordUsage(event: UsageEvent): Promise<void>;
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
    },
  ) {
    const started = this.dependencies.now();
    let providerAttempted = false;
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
      const campaigns =
        input.includeCampaigns !== false && this.dependencies.campaigns
          ? await new CampaignService(this.dependencies.campaigns).listPlanningContexts({
              ...input,
              from: new Date(`${input.weekStartDate}T00:00:00.000Z`),
              to: weekEnd,
            })
          : [];
      providerAttempted = true;
      const result = await new GenerateWeeklyPlan(this.dependencies.planner).execute({
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
      });
      const plan = await new CreateGeneratedWeeklyPlan(
        this.dependencies.plans,
        this.dependencies.assignments,
      ).execute({
        ...input,
        weekStartDate: input.weekStartDate,
        timezone,
        ...result.output,
      });
      await this.dependencies.recordUsage({
        ...input,
        taskType: 'WEEKLY_PLANNER',
        provider: 'openai',
        model: result.model,
        promptVersion: result.promptVersion,
        status: 'SUCCESS',
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        latencyMs: result.latencyMs,
        idempotencyKey: input.usageIdempotencyKey,
      });
      return { plan, titles: new Map(pillars.map(({ id, title }) => [id, title])) };
    } catch (error) {
      if (providerAttempted)
        await this.dependencies.recordUsage({
          ...input,
          taskType: 'WEEKLY_PLANNER',
          provider: 'openai',
          model: this.dependencies.providerModel,
          promptVersion: WEEKLY_PLANNER_PROMPT_VERSION,
          status: 'FAILED',
          inputTokens: null,
          outputTokens: null,
          latencyMs: this.dependencies.now() - started,
          errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
          idempotencyKey: input.usageIdempotencyKey,
        });
      throw error;
    }
  }
}

export async function createWeeklyPlanGenerationService() {
  const { apiKey, model } = await resolveOpenAiRuntimeConfiguration();
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
    planner: new OpenAIWeeklyPlanner({
      apiKey,
      model,
    }),
    providerModel: model,
    async resolveTimezone(scope) {
      const value = await preferences.getScoped(scope);
      if (!value.accessible)
        throw new ApplicationError('NOT_FOUND', 'notification preference scope not found');
      return value.preference?.timezone ?? 'Asia/Tokyo';
    },
    recordUsage: recordAiUsageSafely,
    now: Date.now,
  });
}
