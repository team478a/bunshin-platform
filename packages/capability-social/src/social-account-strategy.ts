import {
  RequireActiveBunshinCapability,
  type BunshinCapabilityAssignmentRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { SOCIAL_PLATFORMS, type SocialPlatform } from './social-profile';
import { nullableText, validateEnum } from './social-validation';
export const SOCIAL_ACCOUNT_STRATEGY_GOALS = [
  'FOLLOWERS',
  'LINE_REGISTRATION',
  'INQUIRY',
  'SALES',
  'RECRUIT',
  'BRAND_AWARENESS',
  'BLOG_TRAFFIC',
  'OTHER',
] as const;
export type SocialAccountStrategyGoal = (typeof SOCIAL_ACCOUNT_STRATEGY_GOALS)[number];
export const SOCIAL_ACCOUNT_STRATEGY_DESTINATIONS = [
  'PROFILE',
  'LINE',
  'LP',
  'BLOG',
  'EC',
  'INQUIRY',
  'RECRUIT_PAGE',
  'NONE',
  'OTHER',
] as const;
export type SocialAccountStrategyDestination =
  (typeof SOCIAL_ACCOUNT_STRATEGY_DESTINATIONS)[number];
export const SOCIAL_ACCOUNT_STRATEGY_STATUSES = [
  'DRAFT',
  'PROPOSED',
  'APPROVED',
  'SUPERSEDED',
] as const;
export type SocialAccountStrategyStatus = (typeof SOCIAL_ACCOUNT_STRATEGY_STATUSES)[number];

export interface SocialAccountStrategy {
  id: string;
  workspaceId: string;
  bunshinId: string;
  socialProfileId: string;
  platform: SocialPlatform;
  goal: SocialAccountStrategyGoal;
  availableMinutes: 3 | 5 | 10 | 20;
  destinationType: SocialAccountStrategyDestination;
  destinationDetail: string | null;
  concept: string;
  positioning: string;
  targetSummary: string;
  profileDraft: string;
  ctaStrategy: string;
  postingPolicy: string;
  version: number;
  status: SocialAccountStrategyStatus;
  approvedAt: Date | null;
  supersededAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface CreateSocialAccountStrategyInput {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
  socialProfileId: string;
  platform: SocialPlatform;
  goal: SocialAccountStrategyGoal;
  availableMinutes: 3 | 5 | 10 | 20;
  destinationType: SocialAccountStrategyDestination;
  destinationDetail?: string | null;
  concept: string;
  positioning: string;
  targetSummary: string;
  profileDraft: string;
  ctaStrategy: string;
  postingPolicy: string;
  status?: 'DRAFT' | 'PROPOSED';
}
export interface SocialAccountStrategyRepository {
  createVersion(input: CreateSocialAccountStrategyInput): Promise<SocialAccountStrategy | null>;
  list(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    socialProfileId: string;
  }): Promise<SocialAccountStrategy[] | null>;
  approve(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    strategyId: string;
  }): Promise<SocialAccountStrategy | null>;
}
function strategyText(value: string, maximum: number, field: string) {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
}
export function normalizeCreateSocialAccountStrategyInput(
  input: CreateSocialAccountStrategyInput,
): CreateSocialAccountStrategyInput {
  if (![3, 5, 10, 20].includes(input.availableMinutes))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid availableMinutes');
  return {
    ...input,
    platform: validateEnum(input.platform, SOCIAL_PLATFORMS, 'platform'),
    goal: validateEnum(input.goal, SOCIAL_ACCOUNT_STRATEGY_GOALS, 'goal'),
    destinationType: validateEnum(
      input.destinationType,
      SOCIAL_ACCOUNT_STRATEGY_DESTINATIONS,
      'destinationType',
    ),
    ...(input.destinationDetail === undefined
      ? {}
      : { destinationDetail: nullableText(input.destinationDetail, 2048) }),
    concept: strategyText(input.concept, 1000, 'concept'),
    positioning: strategyText(input.positioning, 1000, 'positioning'),
    targetSummary: strategyText(input.targetSummary, 1000, 'targetSummary'),
    profileDraft: strategyText(input.profileDraft, 2000, 'profileDraft'),
    ctaStrategy: strategyText(input.ctaStrategy, 1000, 'ctaStrategy'),
    postingPolicy: strategyText(input.postingPolicy, 2000, 'postingPolicy'),
    status:
      input.status === undefined
        ? 'DRAFT'
        : validateEnum(input.status, ['DRAFT', 'PROPOSED'] as const, 'status'),
  };
}
export class CreateSocialAccountStrategy {
  constructor(
    private readonly strategies: SocialAccountStrategyRepository,
    private readonly assignments: BunshinCapabilityAssignmentRepository,
  ) {}
  async execute(input: CreateSocialAccountStrategyInput) {
    const normalized = normalizeCreateSocialAccountStrategyInput(input);
    await new RequireActiveBunshinCapability(this.assignments).execute({
      ...normalized,
      capabilityType: 'SOCIAL',
    });
    const value = await this.strategies.createVersion(normalized);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'social profile not found');
    return value;
  }
}
export class ListSocialAccountStrategies {
  constructor(private readonly strategies: SocialAccountStrategyRepository) {}
  async execute(input: Parameters<SocialAccountStrategyRepository['list']>[0]) {
    const values = await this.strategies.list(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'social profile not found');
    return values;
  }
}
export class ApproveSocialAccountStrategy {
  constructor(
    private readonly strategies: SocialAccountStrategyRepository,
    private readonly assignments: BunshinCapabilityAssignmentRepository,
  ) {}
  async execute(input: Parameters<SocialAccountStrategyRepository['approve']>[0]) {
    await new RequireActiveBunshinCapability(this.assignments).execute({
      ...input,
      capabilityType: 'SOCIAL',
    });
    const value = await this.strategies.approve(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'strategy not found');
    return value;
  }
}

export interface StrategyGeneratorInput {
  wizardTopic: string;
  wizardAudience: string;
  platform: SocialPlatform;
  goal: SocialAccountStrategyGoal;
  availableMinutes: 3 | 5 | 10 | 20;
  destinationType: SocialAccountStrategyDestination;
  destinationDetail: string | null;
  bunshin: {
    name: string;
    objectiveSummary: string;
    audienceSummary: string;
    personalitySummary: string;
    objectives: unknown[];
    audiences: unknown[];
    personality: unknown;
  };
  grantedKnowledge: Array<{ type: string; title: string; content: string }>;
}
export interface StrategyGeneratorOutput {
  concept: string;
  positioning: string;
  targetSummary: string;
  profileDraft: string;
  ctaStrategy: string;
  postingPolicy: string;
}
export interface StrategyGeneratorResult {
  output: StrategyGeneratorOutput;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}
export interface StrategyGeneratorPort {
  generate(input: StrategyGeneratorInput): Promise<StrategyGeneratorResult>;
}
export class GenerateSocialAccountStrategy {
  constructor(private readonly generator: StrategyGeneratorPort) {}
  async execute(input: StrategyGeneratorInput) {
    const result = await this.generator.generate(input);
    return {
      ...result,
      output: {
        concept: strategyText(result.output.concept, 1000, 'concept'),
        positioning: strategyText(result.output.positioning, 1000, 'positioning'),
        targetSummary: strategyText(result.output.targetSummary, 1000, 'targetSummary'),
        profileDraft: strategyText(result.output.profileDraft, 2000, 'profileDraft'),
        ctaStrategy: strategyText(result.output.ctaStrategy, 1000, 'ctaStrategy'),
        postingPolicy: strategyText(result.output.postingPolicy, 2000, 'postingPolicy'),
      },
    };
  }
}
