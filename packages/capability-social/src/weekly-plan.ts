import {
  RequireActiveBunshinCapability,
  type BunshinCapabilityAssignmentRepository,
  type CampaignContentClassification,
  type CampaignPlanningContext,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

import type { SocialPlatform, SocialPreferredFormat } from './social-profile';
import { validateEnum } from './social-validation';
import {
  localDate,
  timezone,
  weeklyFormat,
  weeklyNullable,
  weeklyText,
} from './weekly-plan-validation';
export const WEEKLY_PLAN_STATUSES = ['DRAFT', 'CONFIRMED', 'EXPIRED'] as const;
export type WeeklyPlanStatus = (typeof WEEKLY_PLAN_STATUSES)[number];
export const BUSINESS_CONTENT_CATEGORIES = [
  'HELPFUL_EXPERTISE',
  'COMPANY_STAFF',
  'FAQ_PROBLEM',
  'CASE_STUDY',
  'PRODUCT_SERVICE',
] as const;
export type BusinessContentCategory = (typeof BUSINESS_CONTENT_CATEGORIES)[number];

export interface WeeklyPlanItem {
  id: string;
  workspaceId: string;
  bunshinId: string;
  weeklyPlanId: string;
  scheduledDate: string;
  contentPillarId: string;
  goal: string;
  angle: string;
  recommendedFormat: SocialPreferredFormat;
  notes: string | null;
  campaignId: string | null;
  classification: CampaignContentClassification;
  businessContentCategory?: BusinessContentCategory | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface WeeklyPlan {
  id: string;
  workspaceId: string;
  bunshinId: string;
  weekStartDate: string;
  timezone: string;
  strategySummary: string | null;
  status: WeeklyPlanStatus;
  confirmedAt: Date | null;
  expiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: WeeklyPlanItem[];
}
export interface WeeklyPlanScope {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
}
export interface WeeklyPlanRepository {
  createPlan(
    input: WeeklyPlanScope & {
      weekStartDate: string;
      timezone: string;
      strategySummary?: string | null;
    },
  ): Promise<WeeklyPlan | null>;
  createGeneratedPlan(
    input: WeeklyPlanScope & {
      weekStartDate: string;
      timezone: string;
      strategySummary: string;
      items: Array<{
        scheduledDate: string;
        contentPillarId: string;
        goal: string;
        angle: string;
        recommendedFormat: SocialPreferredFormat;
        notes: string | null;
        campaignId: string | null;
        classification: CampaignContentClassification;
        businessContentCategory?: BusinessContentCategory | null;
      }>;
    },
  ): Promise<WeeklyPlan | null>;
  listPlans(input: WeeklyPlanScope): Promise<WeeklyPlan[] | null>;
  findPlan(input: WeeklyPlanScope & { weeklyPlanId: string }): Promise<WeeklyPlan | null>;
  updatePlan(
    input: WeeklyPlanScope & { weeklyPlanId: string; strategySummary: string | null },
  ): Promise<WeeklyPlan | null>;
  createItem(
    input: WeeklyPlanScope & {
      weeklyPlanId: string;
      scheduledDate: string;
      contentPillarId: string;
      goal: string;
      angle: string;
      recommendedFormat: SocialPreferredFormat;
      notes?: string | null;
    },
  ): Promise<WeeklyPlan | null>;
  updateItem(
    input: WeeklyPlanScope & {
      weeklyPlanId: string;
      itemId: string;
      scheduledDate?: string;
      contentPillarId?: string;
      goal?: string;
      angle?: string;
      recommendedFormat?: SocialPreferredFormat;
      notes?: string | null;
    },
  ): Promise<WeeklyPlan | null>;
  removeItem(
    input: WeeklyPlanScope & { weeklyPlanId: string; itemId: string },
  ): Promise<WeeklyPlan | null>;
  confirmPlan(input: WeeklyPlanScope & { weeklyPlanId: string }): Promise<WeeklyPlan | null>;
  expirePlan(input: WeeklyPlanScope & { weeklyPlanId: string }): Promise<WeeklyPlan | null>;
}

export interface WeeklyPlannerInput {
  weekStartDate: string;
  timezone: string;
  platform: SocialPlatform;
  availableMinutes: 3 | 5 | 10 | 20;
  bunshin: {
    name: string;
    objectiveSummary: string;
    audienceSummary: string;
    personalitySummary: string;
  };
  approvedStrategy: {
    concept: string;
    positioning: string;
    targetSummary: string;
    ctaStrategy: string;
    postingPolicy: string;
  };
  contentPillars: Array<{ id: string; title: string; description: string | null; weight: number }>;
  grantedKnowledge: Array<{ type: string; title: string; content: string }>;
  campaigns?: CampaignPlanningContext[];
  recentPlanTopics?: Array<{ weekStartDate: string; goal: string; angle: string }>;
  recentPerformance?: {
    periodDays: number;
    postedCount: number;
    feedback: { good: number; neutral: number; bad: number };
    formats: Array<{
      format: SocialPreferredFormat;
      postedCount: number;
      goodFeedbackCount: number;
      badFeedbackCount: number;
    }>;
    businessOutcomes?: {
      inquiries: number;
      reservations: number;
      visits: number;
      orders: number;
      other: number;
    };
    successfulTopics?: Array<{
      topic: string;
      outcomeTotal: number;
      businessOutcomes: {
        inquiries: number;
        reservations: number;
        visits: number;
        orders: number;
        other: number;
      };
    }>;
    postPerformance?: {
      recordedCount: number;
      strongTopics: Array<{
        topic: string;
        engagementScore: number;
        saves: number;
        shares: number;
        comments: number;
        follows: number;
      }>;
    };
  };
  businessContentSchedule?: Array<{
    scheduledDate: string;
    category: BusinessContentCategory;
  }>;
}
export interface WeeklyPlannerOutput {
  strategySummary: string;
  items: Array<{
    scheduledDate: string;
    contentPillarId: string;
    goal: string;
    angle: string;
    recommendedFormat: SocialPreferredFormat;
    notes: string | null;
    campaignId: string | null;
    classification: CampaignContentClassification;
    businessContentCategory: BusinessContentCategory | null;
  }>;
}
export interface WeeklyPlannerResult {
  output: WeeklyPlannerOutput;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}
export interface WeeklyPlannerPort {
  generate(input: WeeklyPlannerInput): Promise<WeeklyPlannerResult>;
}

export class GenerateWeeklyPlan {
  constructor(private readonly planner: WeeklyPlannerPort) {}
  async execute(input: WeeklyPlannerInput) {
    const weekStartDate = localDate(input.weekStartDate, true);
    const timezoneValue = timezone(input.timezone);
    if (input.contentPillars.length < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'active content pillar is required');
    const result = await this.planner.generate({
      ...input,
      weekStartDate,
      timezone: timezoneValue,
    });
    if (
      !Array.isArray(result.output.items) ||
      result.output.items.length < 1 ||
      result.output.items.length > 7
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid generated weekly items');
    const pillarIds = new Set(input.contentPillars.map(({ id }) => id));
    const dates = new Set<string>();
    const topicAngles = new Set<string>();
    const campaignValues = input.campaigns ?? [];
    const campaigns = new Map(campaignValues.map((campaign) => [campaign.id, campaign]));
    const start = new Date(`${weekStartDate}T00:00:00Z`).valueOf();
    const items = result.output.items.map((item) => {
      const scheduledDate = localDate(item.scheduledDate);
      const offset = (new Date(`${scheduledDate}T00:00:00Z`).valueOf() - start) / 86400000;
      if (!Number.isInteger(offset) || offset < 0 || offset > 6)
        throw new ApplicationError('VALIDATION_ERROR', 'generated date is outside week');
      if (dates.has(scheduledDate))
        throw new ApplicationError('VALIDATION_ERROR', 'generated dates must be unique');
      dates.add(scheduledDate);
      if (!pillarIds.has(item.contentPillarId))
        throw new ApplicationError('VALIDATION_ERROR', 'generated pillar is outside context');
      const classification =
        campaignValues.length === 0
          ? ('ORGANIC' as const)
          : validateEnum(
              item.classification,
              ['ORGANIC', 'PRODUCT_RELATED', 'ADVERTISEMENT'] as const,
              'classification',
            );
      const campaignId = campaignValues.length === 0 ? null : item.campaignId;
      const campaign = campaignId ? campaigns.get(campaignId) : null;
      if (classification === 'ORGANIC' && campaignId !== null)
        throw new ApplicationError('VALIDATION_ERROR', 'organic item cannot use campaign');
      if (classification !== 'ORGANIC' && !campaign)
        throw new ApplicationError('VALIDATION_ERROR', 'campaign item is outside context');
      const scheduledBusinessCategory = input.businessContentSchedule?.find(
        (entry) => entry.scheduledDate === scheduledDate,
      )?.category;
      if (
        input.businessContentSchedule &&
        (!scheduledBusinessCategory || item.businessContentCategory !== scheduledBusinessCategory)
      )
        throw new ApplicationError('VALIDATION_ERROR', 'generated business content mix is invalid');
      const goal = weeklyText(item.goal, 200, 'goal');
      const angle = weeklyText(item.angle, 500, 'angle');
      const topicAngle = `${goal}\n${angle}`.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
      if (topicAngles.has(topicAngle))
        throw new ApplicationError('VALIDATION_ERROR', 'generated weekly topics must be unique');
      topicAngles.add(topicAngle);
      return {
        scheduledDate,
        contentPillarId: item.contentPillarId,
        goal,
        angle,
        recommendedFormat: weeklyFormat(item.recommendedFormat),
        notes: weeklyNullable(item.notes, 1000) ?? null,
        campaignId,
        classification,
        businessContentCategory: input.businessContentSchedule
          ? (scheduledBusinessCategory ?? null)
          : null,
      };
    });
    if (
      input.businessContentSchedule &&
      (items.length !== input.businessContentSchedule.length ||
        input.businessContentSchedule.some(
          (entry) => !items.some((item) => item.scheduledDate === entry.scheduledDate),
        ))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'generated business schedule is incomplete');
    for (const campaign of campaignValues) {
      const related = items.filter(
        (item) => item.campaignId === campaign.id && item.classification === 'PRODUCT_RELATED',
      );
      const ads = items.filter(
        (item) => item.campaignId === campaign.id && item.classification === 'ADVERTISEMENT',
      );
      if (
        related.length + ads.length > campaign.maxRelatedPerWeek ||
        ads.length > campaign.maxAdsPerWeek
      )
        throw new ApplicationError('VALIDATION_ERROR', 'campaign posting ratio exceeded');
      const promotionalDates = [...related, ...ads]
        .map(({ scheduledDate }) => new Date(`${scheduledDate}T00:00:00Z`).valueOf())
        .sort((left, right) => left - right);
      if (
        promotionalDates.some(
          (value, index) =>
            index > 0 && value - promotionalDates[index - 1]! <= campaign.cooldownDays * 86400000,
        )
      )
        throw new ApplicationError('VALIDATION_ERROR', 'campaign cooldown violated');
    }
    return {
      ...result,
      output: {
        strategySummary: weeklyText(result.output.strategySummary, 1000, 'strategy summary'),
        items,
      },
    };
  }
}

abstract class WeeklyPlanMutation {
  constructor(
    protected readonly plans: WeeklyPlanRepository,
    private readonly assignments: BunshinCapabilityAssignmentRepository,
  ) {}
  protected async requireActive(input: WeeklyPlanScope) {
    await new RequireActiveBunshinCapability(this.assignments).execute({
      ...input,
      capabilityType: 'SOCIAL',
    });
  }
}
export class CreateWeeklyPlan extends WeeklyPlanMutation {
  async execute(
    input: WeeklyPlanScope & {
      weekStartDate: string;
      timezone: string;
      strategySummary?: string | null;
    },
  ) {
    await this.requireActive(input);
    const value = await this.plans.createPlan({
      ...input,
      weekStartDate: localDate(input.weekStartDate, true),
      timezone: timezone(input.timezone),
      ...(input.strategySummary === undefined
        ? {}
        : { strategySummary: weeklyNullable(input.strategySummary, 1000) }),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return value;
  }
}
export class CreateGeneratedWeeklyPlan extends WeeklyPlanMutation {
  async execute(input: Parameters<WeeklyPlanRepository['createGeneratedPlan']>[0]) {
    await this.requireActive(input);
    const value = await this.plans.createGeneratedPlan(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'bunshin or pillar not found');
    return value;
  }
}
export class ListWeeklyPlans {
  constructor(private readonly plans: WeeklyPlanRepository) {}
  async execute(input: WeeklyPlanScope) {
    const value = await this.plans.listPlans(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return value;
  }
}
export class GetWeeklyPlan {
  constructor(private readonly plans: WeeklyPlanRepository) {}
  async execute(input: WeeklyPlanScope & { weeklyPlanId: string }) {
    const value = await this.plans.findPlan(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'weekly plan not found');
    return value;
  }
}
export class UpdateWeeklyPlan extends WeeklyPlanMutation {
  async execute(input: WeeklyPlanScope & { weeklyPlanId: string; strategySummary: string | null }) {
    await this.requireActive(input);
    const value = await this.plans.updatePlan({
      ...input,
      strategySummary: weeklyNullable(input.strategySummary, 1000) ?? null,
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'weekly plan not found');
    return value;
  }
}

function normalizedItem<
  T extends WeeklyPlanScope & {
    weeklyPlanId: string;
    scheduledDate: string;
    contentPillarId: string;
    goal: string;
    angle: string;
    recommendedFormat: SocialPreferredFormat;
    notes?: string | null;
  },
>(input: T) {
  return {
    ...input,
    scheduledDate: localDate(input.scheduledDate),
    goal: weeklyText(input.goal, 200, 'goal'),
    angle: weeklyText(input.angle, 500, 'angle'),
    recommendedFormat: weeklyFormat(input.recommendedFormat),
    ...(input.notes === undefined ? {} : { notes: weeklyNullable(input.notes, 1000) }),
  };
}
export class CreateWeeklyPlanItem extends WeeklyPlanMutation {
  async execute(input: Parameters<WeeklyPlanRepository['createItem']>[0]) {
    await this.requireActive(input);
    const value = await this.plans.createItem(normalizedItem(input));
    if (!value) throw new ApplicationError('NOT_FOUND', 'weekly plan not found');
    return value;
  }
}
export class UpdateWeeklyPlanItem extends WeeklyPlanMutation {
  async execute(input: Parameters<WeeklyPlanRepository['updateItem']>[0]) {
    await this.requireActive(input);
    if (
      input.scheduledDate === undefined &&
      input.contentPillarId === undefined &&
      input.goal === undefined &&
      input.angle === undefined &&
      input.recommendedFormat === undefined &&
      input.notes === undefined
    )
      throw new ApplicationError('VALIDATION_ERROR', 'update required');
    const value = await this.plans.updateItem({
      ...input,
      ...(input.scheduledDate === undefined
        ? {}
        : { scheduledDate: localDate(input.scheduledDate) }),
      ...(input.goal === undefined ? {} : { goal: weeklyText(input.goal, 200, 'goal') }),
      ...(input.angle === undefined ? {} : { angle: weeklyText(input.angle, 500, 'angle') }),
      ...(input.recommendedFormat === undefined
        ? {}
        : { recommendedFormat: weeklyFormat(input.recommendedFormat) }),
      ...(input.notes === undefined ? {} : { notes: weeklyNullable(input.notes, 1000) }),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'weekly plan item not found');
    return value;
  }
}
export class RemoveWeeklyPlanItem extends WeeklyPlanMutation {
  async execute(input: WeeklyPlanScope & { weeklyPlanId: string; itemId: string }) {
    await this.requireActive(input);
    const value = await this.plans.removeItem(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'weekly plan item not found');
    return value;
  }
}
export class ConfirmWeeklyPlan extends WeeklyPlanMutation {
  async execute(input: WeeklyPlanScope & { weeklyPlanId: string }) {
    await this.requireActive(input);
    const value = await this.plans.confirmPlan(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'weekly plan not found');
    return value;
  }
}
export class ExpireWeeklyPlan extends WeeklyPlanMutation {
  async execute(input: WeeklyPlanScope & { weeklyPlanId: string }) {
    await this.requireActive(input);
    const value = await this.plans.expirePlan(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'weekly plan not found');
    return value;
  }
}
