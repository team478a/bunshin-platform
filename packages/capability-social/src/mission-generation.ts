import type { CampaignContentClassification, CampaignPlanningContext } from '@bunshin/application';
import type { FacePolicy } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

import type { ContentPillar } from './content-pillars';
import { missionInteger, missionString, PLATFORM_FORMATS } from './mission-content';
import type { SocialAccountStrategy } from './social-account-strategy';
import {
  SOCIAL_PREFERRED_FORMATS,
  type SocialPlatform,
  type SocialPreferredFormat,
  type SocialProfile,
} from './social-profile';
import { rankTrendIdeaCandidates, type TrendIdeaCandidate } from './trend-research';
import type { BusinessContentCategory, WeeklyPlan } from './weekly-plan';
import { localDate, timezone } from './weekly-plan-validation';
export interface MissionBusinessProfileContext {
  industry: string;
  businessName: string;
  region: string | null;
  productService: string;
  primaryPurpose: string;
  targetAudience: string;
  websiteUrl?: string | null;
  businessFeatures?: string | null;
  priceInformation?: string | null;
  preferredTone?: string | null;
  requiredContent?: string | null;
  forbiddenContent?: string | null;
}

export const MISSION_PERSONALIZATION_SOURCE_TYPES = [
  'BUNSHIN_PROFILE',
  'ONBOARDING_RESPONSE',
  'BUSINESS_PROFILE',
  'SOCIAL_PROFILE',
  'ACCOUNT_STRATEGY',
  'USER_MEMORY',
  'RECENT_ACTIVITY',
  'FEEDBACK_HISTORY',
  'POST_PERFORMANCE',
] as const;
export type MissionPersonalizationSourceType =
  (typeof MISSION_PERSONALIZATION_SOURCE_TYPES)[number];
export interface MissionPersonalizationSignal {
  type: MissionPersonalizationSourceType;
  label: string;
  value: string;
}
export interface MissionPersonalizationContext {
  signals: MissionPersonalizationSignal[];
  instruction: string;
}

export interface DailyMissionPlannerInput {
  workspaceId: string;
  bunshinId: string;
  missionDate: string;
  timezone: string;
  socialProfile: SocialProfile;
  bunshin: {
    name: string;
    objectiveSummary: string;
    audienceSummary: string;
    personalitySummary: string;
    personality: {
      versionId: string;
      version: number;
      tone: string;
      formality: string;
      energyLevel: string;
      expertiseLevel: string;
      sentenceStyle: string;
      firstPerson: string;
      forbiddenExpressions: string[];
      preferredExpressions: string[];
      visualDirection: string | null;
      facePolicy: FacePolicy;
    } | null;
  };
  facePolicy: FacePolicy;
  recentFormats?: SocialPreferredFormat[];
  recentTopics?: Array<{ missionDate: string; topic: string; angle: string }>;
  approvedStrategy: SocialAccountStrategy;
  weeklyPlan: WeeklyPlan;
  contentPillars: ContentPillar[];
  grantedKnowledge: Array<{ type: string; title: string; content: string }>;
  businessProfile?: MissionBusinessProfileContext | null;
  trendIdeas?: TrendIdeaCandidate[];
  campaign?: CampaignPlanningContext | null;
  personalization?: MissionPersonalizationContext;
}

const PLATFORM_FORMAT_PRIORITY: Record<SocialPlatform, readonly SocialPreferredFormat[]> = {
  INSTAGRAM: ['SLIDE', 'IMAGE', 'LIVE_ACTION', 'AI_VIDEO_PROMPT', 'TEXT'],
  TIKTOK: ['LIVE_ACTION', 'AI_VIDEO_PROMPT', 'IMAGE'],
  X: ['TEXT', 'IMAGE'],
  THREADS: ['TEXT', 'IMAGE'],
  YOUTUBE_SHORTS: ['LIVE_ACTION', 'AI_VIDEO_PROMPT'],
  OTHER: SOCIAL_PREFERRED_FORMATS,
};

export function selectDailyMissionFormat(input: {
  platform: SocialPlatform;
  preferredFormats: SocialPreferredFormat[];
  weeklyRecommendedFormat: SocialPreferredFormat;
  facePolicy: FacePolicy;
  availableMinutes: 3 | 5 | 10 | 20;
  recentFormats?: SocialPreferredFormat[];
}): SocialPreferredFormat {
  const supported = PLATFORM_FORMATS[input.platform];
  const preferred = input.preferredFormats.filter((format) => supported.includes(format));
  const base = preferred.length > 0 ? preferred : [...PLATFORM_FORMAT_PRIORITY[input.platform]];
  const isExecutable = (format: SocialPreferredFormat) => {
    if (
      format === 'LIVE_ACTION' &&
      (!['FACE_OK', 'FACE_NG_VOICE_OK'].includes(input.facePolicy) || input.availableMinutes < 10)
    )
      return false;
    if (format === 'SLIDE' && input.availableMinutes < 5) return false;
    if (format === 'AI_VIDEO_PROMPT' && !preferred.includes('AI_VIDEO_PROMPT')) return false;
    return true;
  };
  const executable = base.filter(isExecutable);
  const fallback = PLATFORM_FORMAT_PRIORITY[input.platform].filter(
    (format) => supported.includes(format) && isExecutable(format),
  );
  const candidates = executable.length > 0 ? executable : fallback;
  if (candidates.length === 0)
    throw new ApplicationError('VALIDATION_ERROR', 'no executable format for platform');
  const recent = new Set(input.recentFormats?.slice(-2) ?? []);
  const nonRepeated = candidates.filter((format) => !recent.has(format));
  const selectable = nonRepeated.length > 0 ? nonRepeated : candidates;
  if (
    selectable.includes(input.weeklyRecommendedFormat) &&
    input.preferredFormats.includes(input.weeklyRecommendedFormat)
  )
    return input.weeklyRecommendedFormat;
  return (
    PLATFORM_FORMAT_PRIORITY[input.platform].find((format) => selectable.includes(format)) ??
    selectable[0]!
  );
}

export interface DailyMissionPlannerProviderInput {
  missionDate: string;
  timezone: string;
  platform: SocialPlatform;
  availableMinutes: 3 | 5 | 10 | 20;
  recentTopics?: Array<{ missionDate: string; topic: string; angle: string }>;
  bunshin: DailyMissionPlannerInput['bunshin'];
  approvedStrategy: {
    concept: string;
    positioning: string;
    targetSummary: string;
    ctaStrategy: string;
    postingPolicy: string;
  };
  weeklyPlanStrategySummary: string | null;
  weeklyItem: {
    goal: string;
    angle: string;
    recommendedFormat: SocialPreferredFormat;
    notes: string | null;
    campaignId: string | null;
    classification: CampaignContentClassification;
    businessContentCategory?: BusinessContentCategory | null;
  };
  campaign?: CampaignPlanningContext | null;
  contentPillar: { title: string; description: string | null };
  grantedKnowledge: DailyMissionPlannerInput['grantedKnowledge'];
  businessProfile?: MissionBusinessProfileContext | null;
  personalization?: MissionPersonalizationContext;
  trendIdeas?: Array<{
    topic: string;
    hook: string;
    whyNow: string;
    fitReason: string;
  }>;
}

export interface DailyMissionPlannerOutput {
  topic: string;
  angle: string;
  reason: string;
  estimatedMinutes: number;
  usedTrendIdea: boolean;
  personalizationSourceTypes?: MissionPersonalizationSourceType[];
  personalizationReason?: string;
}

export interface DailyMissionPlannerResult {
  output: DailyMissionPlannerOutput;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface DailyMissionPlannerPort {
  generate(input: DailyMissionPlannerProviderInput): Promise<DailyMissionPlannerResult>;
}

export interface DailyMissionBrief extends Omit<DailyMissionPlannerOutput, 'usedTrendIdea'> {
  missionDate: string;
  socialProfileId: string;
  weeklyPlanItemId: string;
  format: SocialPreferredFormat;
  trendCandidateId?: string;
  campaignId: string | null;
  classification: CampaignContentClassification;
}

export class GenerateDailyMissionBrief {
  constructor(private readonly planner: DailyMissionPlannerPort) {}

  async execute(input: DailyMissionPlannerInput) {
    const missionDate = localDate(input.missionDate);
    const timezoneValue = timezone(input.timezone);
    if (
      input.socialProfile.workspaceId !== input.workspaceId ||
      input.socialProfile.bunshinId !== input.bunshinId ||
      input.socialProfile.status !== 'ACTIVE'
    )
      throw new ApplicationError('NOT_FOUND', 'active social profile not found');
    if (
      input.approvedStrategy.workspaceId !== input.workspaceId ||
      input.approvedStrategy.bunshinId !== input.bunshinId ||
      input.approvedStrategy.socialProfileId !== input.socialProfile.id ||
      input.approvedStrategy.platform !== input.socialProfile.platform ||
      input.approvedStrategy.status !== 'APPROVED'
    )
      throw new ApplicationError('NOT_FOUND', 'approved strategy not found');
    if (
      input.weeklyPlan.workspaceId !== input.workspaceId ||
      input.weeklyPlan.bunshinId !== input.bunshinId
    )
      throw new ApplicationError('NOT_FOUND', 'weekly plan not found');
    if (input.weeklyPlan.status !== 'CONFIRMED')
      throw new ApplicationError('CONFLICT', 'confirmed weekly plan is required');
    if (input.weeklyPlan.timezone !== timezoneValue)
      throw new ApplicationError('VALIDATION_ERROR', 'weekly plan timezone mismatch');
    const item = input.weeklyPlan.items.find(({ scheduledDate }) => scheduledDate === missionDate);
    if (!item) throw new ApplicationError('NOT_FOUND', 'weekly plan item not found for date');
    if (
      item.workspaceId !== input.workspaceId ||
      item.bunshinId !== input.bunshinId ||
      item.weeklyPlanId !== input.weeklyPlan.id
    )
      throw new ApplicationError('NOT_FOUND', 'weekly plan item not found');
    const pillar = input.contentPillars.find(
      ({ id, workspaceId, bunshinId, active, deletedAt }) =>
        id === item.contentPillarId &&
        workspaceId === input.workspaceId &&
        bunshinId === input.bunshinId &&
        active &&
        deletedAt === null,
    );
    if (!pillar) throw new ApplicationError('NOT_FOUND', 'active content pillar not found');

    const selectedFormat = selectDailyMissionFormat({
      platform: input.socialProfile.platform,
      preferredFormats: input.socialProfile.preferredFormats,
      weeklyRecommendedFormat: item.recommendedFormat,
      facePolicy: input.facePolicy,
      availableMinutes: input.approvedStrategy.availableMinutes,
      ...(input.recentFormats ? { recentFormats: input.recentFormats } : {}),
    });
    const trendIdeas = rankTrendIdeaCandidates({
      candidates: input.trendIdeas ?? [],
      platform: input.socialProfile.platform,
      format: selectedFormat,
      availableMinutes: input.approvedStrategy.availableMinutes,
      at: new Date(`${missionDate}T00:00:00.000Z`),
      maximum: 1,
    });

    const result = await this.planner.generate({
      missionDate,
      timezone: timezoneValue,
      platform: input.socialProfile.platform,
      availableMinutes: input.approvedStrategy.availableMinutes,
      ...(input.recentTopics ? { recentTopics: input.recentTopics } : {}),
      bunshin: input.bunshin,
      approvedStrategy: {
        concept: input.approvedStrategy.concept,
        positioning: input.approvedStrategy.positioning,
        targetSummary: input.approvedStrategy.targetSummary,
        ctaStrategy: input.approvedStrategy.ctaStrategy,
        postingPolicy: input.approvedStrategy.postingPolicy,
      },
      weeklyPlanStrategySummary: input.weeklyPlan.strategySummary,
      weeklyItem: {
        goal: item.goal,
        angle: item.angle,
        recommendedFormat: selectedFormat,
        notes: item.notes,
        campaignId: item.campaignId,
        classification: item.classification,
        businessContentCategory: item.businessContentCategory ?? null,
      },
      campaign: input.campaign ?? null,
      ...(input.personalization ? { personalization: input.personalization } : {}),
      contentPillar: { title: pillar.title, description: pillar.description },
      grantedKnowledge: input.grantedKnowledge,
      businessProfile: input.businessProfile ?? null,
      ...(trendIdeas.length > 0
        ? {
            trendIdeas: trendIdeas.map(({ topic, hook, whyNow, fitReason }) => ({
              topic,
              hook,
              whyNow,
              fitReason,
            })),
          }
        : {}),
    });
    const estimatedMinutes = missionInteger(
      result.output.estimatedMinutes,
      1,
      input.approvedStrategy.availableMinutes,
      'estimated minutes',
    );
    if (typeof result.output.usedTrendIdea !== 'boolean')
      throw new ApplicationError('VALIDATION_ERROR', 'invalid trend usage decision');
    if (result.output.usedTrendIdea && trendIdeas.length === 0)
      throw new ApplicationError('VALIDATION_ERROR', 'trend idea was not available');
    let personalizationSourceTypes: MissionPersonalizationSourceType[] | undefined;
    let personalizationReason: string | undefined;
    if (input.personalization) {
      const available = new Set(input.personalization.signals.map(({ type }) => type));
      const selected = result.output.personalizationSourceTypes;
      if (
        !Array.isArray(selected) ||
        selected.length < 1 ||
        selected.some((type) => !MISSION_PERSONALIZATION_SOURCE_TYPES.includes(type)) ||
        selected.some((type) => !available.has(type)) ||
        new Set(selected).size !== selected.length
      )
        throw new ApplicationError('VALIDATION_ERROR', 'invalid personalization source decision');
      personalizationSourceTypes = selected;
      personalizationReason = missionString(
        result.output.personalizationReason ?? '',
        500,
        'personalization reason',
      );
    }
    const output: DailyMissionBrief = {
      missionDate,
      socialProfileId: input.socialProfile.id,
      weeklyPlanItemId: item.id,
      format: selectedFormat,
      topic: missionString(result.output.topic, 200, 'topic'),
      angle: missionString(result.output.angle, 500, 'angle'),
      reason: missionString(result.output.reason, 1000, 'reason'),
      estimatedMinutes,
      campaignId: item.campaignId,
      classification: item.classification,
    };
    if (personalizationSourceTypes && personalizationReason) {
      output.personalizationSourceTypes = personalizationSourceTypes;
      output.personalizationReason = personalizationReason;
    }
    if (result.output.usedTrendIdea) output.trendCandidateId = trendIdeas[0]!.id;
    return { ...result, output };
  }
}

export * from './mission-content-generation';
export * from './mission-quality';
