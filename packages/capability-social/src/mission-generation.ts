import type {
  CampaignContentClassification,
  CampaignPlanningContext,
  SelectedBunshinMemory,
} from '@bunshin/application';
import type { FacePolicy } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

import type { ContentPillar } from './content-pillars';
import {
  assertPlatformFormat,
  missionInteger,
  missionString,
  normalizeMissionContent,
  PLATFORM_FORMATS,
  strict,
  validatePlatformContent,
  type MissionContent,
} from './mission-content';
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

export interface MissionContentGeneratorInput {
  platform: SocialPlatform;
  brief: DailyMissionBrief;
  bunshin: DailyMissionPlannerInput['bunshin'];
  approvedStrategy: DailyMissionPlannerProviderInput['approvedStrategy'];
  contentPillar: { title: string; description: string | null };
  grantedKnowledge: DailyMissionPlannerInput['grantedKnowledge'];
  businessProfile?: MissionBusinessProfileContext | null;
  groupKnowledge?: Array<{
    chunkId: string;
    sourceId: string;
    type: 'GENERAL' | 'FACT' | 'FAQ' | 'RULE';
    sourceLabel: string;
    content: string;
  }>;
  selectedMemories: SelectedBunshinMemory[];
  campaign?: CampaignPlanningContext | null;
  personalization?: MissionPersonalizationContext;
  /** Existing Mission content that must be rewritten into a meaningfully different proposal. */
  variantSourceContent?: MissionContent;
  variantInstructions?: string[];
  repairInstructions?: string[];
}

export interface MissionContentGeneratorProviderInput extends Omit<
  MissionContentGeneratorInput,
  'brief' | 'selectedMemories'
> {
  brief: Pick<
    DailyMissionBrief,
    | 'missionDate'
    | 'format'
    | 'topic'
    | 'angle'
    | 'reason'
    | 'estimatedMinutes'
    | 'personalizationSourceTypes'
    | 'personalizationReason'
  >;
  selectedMemories: Array<Omit<SelectedBunshinMemory, 'id'>>;
}

export interface MissionContentGeneratorResult {
  output: MissionContent;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface MissionContentGeneratorPort {
  generate(input: MissionContentGeneratorProviderInput): Promise<MissionContentGeneratorResult>;
}

export class GenerateMissionContent {
  constructor(private readonly generator: MissionContentGeneratorPort) {}

  async execute(input: MissionContentGeneratorInput) {
    assertPlatformFormat(input.platform, input.brief.format);
    if (input.variantSourceContent !== undefined) {
      input.variantSourceContent = normalizeMissionContent(
        input.brief.format,
        input.variantSourceContent,
      );
      if (!input.variantInstructions?.length || input.variantInstructions.length > 10)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid variant instructions');
      input.variantInstructions = input.variantInstructions.map((value) =>
        missionString(value, 500, 'variant instruction'),
      );
    } else if (input.variantInstructions !== undefined) {
      throw new ApplicationError('VALIDATION_ERROR', 'variant source content is required');
    }
    if (input.repairInstructions !== undefined) {
      if (input.repairInstructions.length < 1 || input.repairInstructions.length > 10)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid repair instructions');
      input.repairInstructions = input.repairInstructions.map((value) =>
        missionString(value, 500, 'repair instruction'),
      );
    }
    const {
      missionDate,
      format,
      topic,
      angle,
      reason,
      estimatedMinutes,
      personalizationSourceTypes,
      personalizationReason,
    } = input.brief;
    const selectedMemories = input.selectedMemories.map(
      ({ type, summary, content, selectionReason }) => ({
        type,
        summary,
        content,
        selectionReason,
      }),
    );
    const result = await this.generator.generate({
      ...input,
      brief: {
        missionDate,
        format,
        topic,
        angle,
        reason,
        estimatedMinutes,
        ...(personalizationSourceTypes && personalizationReason
          ? { personalizationSourceTypes, personalizationReason }
          : {}),
      },
      selectedMemories,
    });
    const output = normalizeMissionContent(input.brief.format, result.output);
    // The model sometimes returns its own creation-time estimate even though the
    // mission brief is the user-facing time budget. Keep generated content within
    // that already validated budget instead of rejecting an otherwise usable post.
    if (
      'estimatedMinutes' in output &&
      typeof output.estimatedMinutes === 'number' &&
      output.estimatedMinutes > input.brief.estimatedMinutes
    ) {
      output.estimatedMinutes = input.brief.estimatedMinutes;
    }
    validatePlatformContent(input.platform, input.brief, output);
    return {
      ...result,
      output,
    };
  }
}

export interface MissionQualityCheckerInput {
  platform: SocialPlatform;
  brief: DailyMissionBrief;
  content: MissionContent;
  bunshin: DailyMissionPlannerInput['bunshin'];
  approvedStrategy: DailyMissionPlannerProviderInput['approvedStrategy'];
  businessProfile?: MissionBusinessProfileContext | null;
  selectedMemories: SelectedBunshinMemory[];
  groupKnowledge?: MissionContentGeneratorInput['groupKnowledge'];
  recentContent?: Array<{
    missionDate: string;
    topic: string;
    angle: string;
    contentExcerpt: string;
  }>;
  personalization?: MissionPersonalizationContext;
}

export interface MissionQualityCheckerProviderInput extends Omit<
  MissionQualityCheckerInput,
  'brief' | 'selectedMemories'
> {
  brief: Pick<
    DailyMissionBrief,
    | 'missionDate'
    | 'format'
    | 'topic'
    | 'angle'
    | 'reason'
    | 'estimatedMinutes'
    | 'personalizationSourceTypes'
    | 'personalizationReason'
  >;
  selectedMemories: Array<Omit<SelectedBunshinMemory, 'id'>>;
}

export const MISSION_QUALITY_VERDICTS = ['PASS', 'REVISE', 'REJECT'] as const;
export type MissionQualityVerdict = (typeof MISSION_QUALITY_VERDICTS)[number];
export const MISSION_QUALITY_SEVERITIES = ['WARNING', 'ERROR'] as const;
export type MissionQualitySeverity = (typeof MISSION_QUALITY_SEVERITIES)[number];
export interface MissionQualityIssue {
  code: string;
  severity: MissionQualitySeverity;
  field: string;
  message: string;
  repairInstruction: string;
}
export interface MissionQualityCheckerOutput {
  verdict: MissionQualityVerdict;
  score: number;
  issues: MissionQualityIssue[];
}

export interface MissionQualityCheckerResult {
  output: MissionQualityCheckerOutput;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface MissionQualityCheckerPort {
  check(input: MissionQualityCheckerProviderInput): Promise<MissionQualityCheckerResult>;
}

const carouselComparableText = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[\s、。！？!?,.・「」『』（）()【】]/gu, '')
    .toLowerCase();

const deterministicImageCarouselIssues = (content: MissionContent): MissionQualityIssue[] => {
  const slides = content['slides'];
  if (!Array.isArray(slides) || slides.length !== 5) return [];
  const issues: MissionQualityIssue[] = [];
  const seenMessages = new Set<string>();
  const seenScenes = new Set<string>();
  for (const [index, rawSlide] of slides.entries()) {
    if (!rawSlide || typeof rawSlide !== 'object') continue;
    const slide = rawSlide as Record<string, unknown>;
    const headline = typeof slide['headline'] === 'string' ? slide['headline'].trim() : '';
    const body = typeof slide['body'] === 'string' ? slide['body'].trim() : '';
    const visualScene = typeof slide['visualScene'] === 'string' ? slide['visualScene'].trim() : '';
    const page = index + 1;
    if (Array.from(headline).length > 20) {
      issues.push({
        code: 'CAROUSEL_TEXT_TOO_LONG',
        severity: 'ERROR',
        field: `slides.${index}.headline`,
        message: `${page}枚目の見出しが画像内で省略されます。`,
        repairInstruction: `${page}枚目の見出しを、意味を変えず20文字以内のやさしい日本語にする。`,
      });
    }
    const bodyLimit = index === 0 ? 24 : 72;
    if (Array.from(body).length > bodyLimit) {
      issues.push({
        code: 'CAROUSEL_TEXT_TOO_LONG',
        severity: 'ERROR',
        field: `slides.${index}.body`,
        message: `${page}枚目の本文が画像内で省略されます。`,
        repairInstruction: `${page}枚目の本文を、要点を残して${bodyLimit}文字以内のやさしい日本語にする。`,
      });
    }
    const messageKey = carouselComparableText(`${headline}${body}`);
    if (messageKey && seenMessages.has(messageKey)) {
      issues.push({
        code: 'CAROUSEL_DUPLICATE_MESSAGE',
        severity: 'ERROR',
        field: `slides.${index}`,
        message: `${page}枚目が前のページと同じ内容です。`,
        repairInstruction: `${page}枚目をその役割だけの新しい情報に直し、前ページの言い換えにしない。`,
      });
    }
    seenMessages.add(messageKey);
    const sceneKey = carouselComparableText(visualScene);
    if (sceneKey && seenScenes.has(sceneKey)) {
      issues.push({
        code: 'REPEATED_VISUAL_SCENE',
        severity: 'ERROR',
        field: `slides.${index}.visualScene`,
        message: `${page}枚目の写真構成が前のページと重複しています。`,
        repairInstruction: `${page}枚目は内容に合う別の動作、カメラ角度、小物、背景を具体的に指定する。`,
      });
    }
    seenScenes.add(sceneKey);
  }
  const cta = slides[4] as Record<string, unknown>;
  const ctaHeadline = typeof cta?.['headline'] === 'string' ? cta['headline'] : '';
  const ctaBody = typeof cta?.['body'] === 'string' ? cta['body'] : '';
  const ctaText = `${ctaHeadline}${ctaBody}`;
  if (
    !/(保存|試|確認|選|書|作|始|相談|予約|登録|タップ|見返|送|答|コメント|フォロー|プロフィール)/u.test(
      ctaText,
    )
  ) {
    issues.push({
      code: 'CAROUSEL_NO_ACTION',
      severity: 'ERROR',
      field: 'slides.4',
      message: '最後のページで読者が次にすることが分かりません。',
      repairInstruction:
        '5枚目に、保存する・今日一つ試す・コメントするなど、読者が今すぐできる行動を一つだけ明記する。',
    });
  }
  return issues.slice(0, 10);
};

export class CheckMissionQuality {
  constructor(private readonly checker: MissionQualityCheckerPort) {}

  async execute(input: MissionQualityCheckerInput) {
    assertPlatformFormat(input.platform, input.brief.format);
    const content = normalizeMissionContent(input.brief.format, input.content);
    const {
      missionDate,
      format,
      topic,
      angle,
      reason,
      estimatedMinutes,
      personalizationSourceTypes,
      personalizationReason,
    } = input.brief;
    const selectedMemories = input.selectedMemories.map(
      ({ type, summary, content, selectionReason }) => ({
        type,
        summary,
        content,
        selectionReason,
      }),
    );
    const result = await this.checker.check({
      ...input,
      brief: {
        missionDate,
        format,
        topic,
        angle,
        reason,
        estimatedMinutes,
        ...(personalizationSourceTypes && personalizationReason
          ? { personalizationSourceTypes, personalizationReason }
          : {}),
      },
      content,
      selectedMemories,
    });
    const score = missionInteger(result.output.score, 0, 100, 'quality score');
    if (!Array.isArray(result.output.issues) || result.output.issues.length > 10)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid quality issues');
    const providerIssues = result.output.issues.map((value) => {
      const issue = strict(
        value,
        ['code', 'severity', 'field', 'message', 'repairInstruction'],
        'quality issue',
      );
      const severity = missionString(issue['severity'], 20, 'quality severity');
      if (!MISSION_QUALITY_SEVERITIES.includes(severity as MissionQualitySeverity))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid quality severity');
      return {
        code: missionString(issue['code'], 80, 'quality issue code'),
        severity: severity as MissionQualitySeverity,
        field: missionString(issue['field'], 100, 'quality issue field'),
        message: missionString(issue['message'], 500, 'quality issue message'),
        repairInstruction: missionString(
          issue['repairInstruction'],
          500,
          'quality repair instruction',
        ),
      };
    });
    if (!MISSION_QUALITY_VERDICTS.includes(result.output.verdict))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid quality verdict');
    const deterministicIssues =
      input.brief.format === 'IMAGE' ? deterministicImageCarouselIssues(content) : [];
    const issues = [...deterministicIssues, ...providerIssues]
      .filter(
        (issue, index, values) =>
          values.findIndex(
            (candidate) => candidate.code === issue.code && candidate.field === issue.field,
          ) === index,
      )
      .slice(0, 10);
    const deterministicVerdict = deterministicIssues.length > 0 ? 'REVISE' : 'PASS';
    const verdict =
      score < 70
        ? 'REJECT'
        : result.output.verdict === 'REJECT'
          ? 'REJECT'
          : result.output.verdict === 'REVISE' || deterministicVerdict === 'REVISE'
            ? 'REVISE'
            : 'PASS';
    return {
      ...result,
      output: {
        verdict,
        score: deterministicIssues.length > 0 ? Math.min(score, 84) : score,
        issues,
      },
    };
  }
}
