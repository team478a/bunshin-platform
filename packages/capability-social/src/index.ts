import {
  RequireActiveBunshinCapability,
  validateGenerationContextSnapshot,
  type BunshinCapabilityAssignmentRepository,
  type GenerationContextSnapshotPayload,
  type SelectedBunshinMemory,
  type CampaignPlanningContext,
  type CampaignContentClassification,
  type ActivityContinuityRule,
  DEFAULT_ACTIVITY_CONTINUITY_RULE,
} from '@bunshin/application';
import type { FacePolicy } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

export const SOCIAL_PLATFORMS = [
  'INSTAGRAM',
  'TIKTOK',
  'X',
  'THREADS',
  'YOUTUBE_SHORTS',
  'OTHER',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_POSTING_FREQUENCIES = [
  'DAILY',
  'WEEKDAYS',
  'THREE_PER_WEEK',
  'WEEKLY',
  'FLEXIBLE',
] as const;
export type SocialPostingFrequency = (typeof SOCIAL_POSTING_FREQUENCIES)[number];

export const SOCIAL_PREFERRED_FORMATS = [
  'TEXT',
  'SLIDE',
  'LIVE_ACTION',
  'AI_VIDEO_PROMPT',
  'IMAGE',
] as const;
export type SocialPreferredFormat = (typeof SOCIAL_PREFERRED_FORMATS)[number];

export const CONTENT_ASSISTANCE_LEVELS = ['IDEA_ONLY', 'GUIDED', 'READY_TO_USE'] as const;
export type ContentAssistanceLevel = (typeof CONTENT_ASSISTANCE_LEVELS)[number];
export const DEFAULT_CONTENT_ASSISTANCE_LEVEL: ContentAssistanceLevel = 'READY_TO_USE';

export const SOCIAL_PROFILE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type SocialProfileStatus = (typeof SOCIAL_PROFILE_STATUSES)[number];

export interface SocialProfile {
  id: string;
  workspaceId: string;
  bunshinId: string;
  platform: SocialPlatform;
  handle: string | null;
  profileUrl: string | null;
  purpose: string;
  postingFrequency: SocialPostingFrequency;
  preferredFormats: SocialPreferredFormat[];
  defaultAssistanceLevel: ContentAssistanceLevel;
  status: SocialProfileStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSocialProfileInput {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
  platform: SocialPlatform;
  handle?: string | null;
  profileUrl?: string | null;
  purpose: string;
  postingFrequency: SocialPostingFrequency;
  preferredFormats: SocialPreferredFormat[];
  defaultAssistanceLevel?: ContentAssistanceLevel;
}

export interface UpdateSocialProfileInput {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
  platform: SocialPlatform;
  handle?: string | null;
  profileUrl?: string | null;
  purpose?: string;
  postingFrequency?: SocialPostingFrequency;
  preferredFormats?: SocialPreferredFormat[];
  defaultAssistanceLevel?: ContentAssistanceLevel;
}

export interface SocialProfileRepository {
  create(input: CreateSocialProfileInput): Promise<SocialProfile | null>;
  list(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }): Promise<SocialProfile[] | null>;
  findByPlatform(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    platform: SocialPlatform;
  }): Promise<SocialProfile | null>;
  update(input: UpdateSocialProfileInput): Promise<SocialProfile | null>;
  setActive(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    platform: SocialPlatform;
    active: boolean;
  }): Promise<SocialProfile | null>;
}

const isOneOf = <T extends string>(value: string, values: readonly T[]): value is T =>
  values.some((candidate) => candidate === value);

export function parsePreferredFormats(value: unknown): SocialPreferredFormat[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > SOCIAL_PREFERRED_FORMATS.length) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      `preferredFormats must contain 1 to ${SOCIAL_PREFERRED_FORMATS.length} values`,
    );
  }
  const parsed: SocialPreferredFormat[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !isOneOf(item, SOCIAL_PREFERRED_FORMATS)) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid preferred format');
    }
    if (parsed.includes(item)) {
      throw new ApplicationError('VALIDATION_ERROR', 'preferredFormats must be unique');
    }
    parsed.push(item);
  }
  return parsed;
}

export function parseContentAssistanceLevel(value: unknown): ContentAssistanceLevel {
  if (typeof value !== 'string' || !isOneOf(value, CONTENT_ASSISTANCE_LEVELS)) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid content assistance level');
  }
  return value;
}

function nullableText(value: string | null, maximum: number): string | null;
function nullableText(value: undefined, maximum: number): undefined;
function nullableText(value: string | null | undefined, maximum: number): string | null | undefined;
function nullableText(value: string | null | undefined, maximum: number) {
  if (value === undefined) return undefined;
  if (value === null || value.trim().length === 0) return null;
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new ApplicationError('VALIDATION_ERROR', 'text exceeds maximum length');
  }
  return normalized;
}

function purpose(value: string) {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 500) {
    throw new ApplicationError('VALIDATION_ERROR', 'purpose must contain 1 to 500 characters');
  }
  return normalized;
}

function profileUrl(value: string | null): string | null;
function profileUrl(value: undefined): undefined;
function profileUrl(value: string | null | undefined): string | null | undefined;
function profileUrl(value: string | null | undefined) {
  const normalized = nullableText(value, 2048);
  if (normalized === undefined || normalized === null) return normalized;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'profileUrl must be a URL', error);
  }
  if (parsed.protocol !== 'https:') {
    throw new ApplicationError('VALIDATION_ERROR', 'profileUrl must use HTTPS');
  }
  return normalized;
}

function validateEnum<T extends string>(value: string, values: readonly T[], field: string): T {
  if (!isOneOf(value, values)) {
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  }
  return value;
}

export function normalizeCreateSocialProfileInput(
  input: CreateSocialProfileInput,
): CreateSocialProfileInput {
  return {
    workspaceId: input.workspaceId,
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    actorUserId: input.actorUserId,
    bunshinId: input.bunshinId,
    platform: validateEnum(input.platform, SOCIAL_PLATFORMS, 'platform'),
    ...(input.handle === undefined ? {} : { handle: nullableText(input.handle, 100) }),
    ...(input.profileUrl === undefined ? {} : { profileUrl: profileUrl(input.profileUrl) }),
    purpose: purpose(input.purpose),
    postingFrequency: validateEnum(
      input.postingFrequency,
      SOCIAL_POSTING_FREQUENCIES,
      'postingFrequency',
    ),
    preferredFormats: parsePreferredFormats(input.preferredFormats),
    defaultAssistanceLevel: parseContentAssistanceLevel(
      input.defaultAssistanceLevel ?? DEFAULT_CONTENT_ASSISTANCE_LEVEL,
    ),
  };
}

export function normalizeUpdateSocialProfileInput(
  input: UpdateSocialProfileInput,
): UpdateSocialProfileInput {
  const mutable = [
    input.handle,
    input.profileUrl,
    input.purpose,
    input.postingFrequency,
    input.preferredFormats,
    input.defaultAssistanceLevel,
  ];
  if (mutable.every((value) => value === undefined)) {
    throw new ApplicationError('VALIDATION_ERROR', 'at least one update field is required');
  }
  return {
    workspaceId: input.workspaceId,
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    actorUserId: input.actorUserId,
    bunshinId: input.bunshinId,
    platform: validateEnum(input.platform, SOCIAL_PLATFORMS, 'platform'),
    ...(input.handle === undefined ? {} : { handle: nullableText(input.handle, 100) }),
    ...(input.profileUrl === undefined ? {} : { profileUrl: profileUrl(input.profileUrl) }),
    ...(input.purpose === undefined ? {} : { purpose: purpose(input.purpose) }),
    ...(input.postingFrequency === undefined
      ? {}
      : {
          postingFrequency: validateEnum(
            input.postingFrequency,
            SOCIAL_POSTING_FREQUENCIES,
            'postingFrequency',
          ),
        }),
    ...(input.preferredFormats === undefined
      ? {}
      : { preferredFormats: parsePreferredFormats(input.preferredFormats) }),
    ...(input.defaultAssistanceLevel === undefined
      ? {}
      : { defaultAssistanceLevel: parseContentAssistanceLevel(input.defaultAssistanceLevel) }),
  };
}

abstract class SocialProfileMutation {
  constructor(
    protected readonly profiles: SocialProfileRepository,
    private readonly assignments: BunshinCapabilityAssignmentRepository,
  ) {}

  protected async requireActive(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }) {
    await new RequireActiveBunshinCapability(this.assignments).execute({
      ...input,
      capabilityType: 'SOCIAL',
    });
  }
}

export class CreateSocialProfile extends SocialProfileMutation {
  async execute(input: CreateSocialProfileInput) {
    const normalized = normalizeCreateSocialProfileInput(input);
    await this.requireActive(normalized);
    const value = await this.profiles.create(normalized);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return value;
  }
}

export class ListSocialProfiles {
  constructor(private readonly profiles: SocialProfileRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }) {
    const values = await this.profiles.list(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return values;
  }
}

export class GetSocialProfile {
  constructor(private readonly profiles: SocialProfileRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    platform: SocialPlatform;
  }) {
    const value = await this.profiles.findByPlatform(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'social profile not found');
    return value;
  }
}

export class UpdateSocialProfile extends SocialProfileMutation {
  async execute(input: UpdateSocialProfileInput) {
    const normalized = normalizeUpdateSocialProfileInput(input);
    await this.requireActive(normalized);
    const value = await this.profiles.update(normalized);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'social profile not found');
    return value;
  }
}

abstract class SetSocialProfileActive extends SocialProfileMutation {
  constructor(
    profiles: SocialProfileRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly active: boolean,
  ) {
    super(profiles, assignments);
  }

  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    platform: SocialPlatform;
  }) {
    await this.requireActive(input);
    const value = await this.profiles.setActive({ ...input, active: this.active });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'social profile not found');
    return value;
  }
}

export class ActivateSocialProfile extends SetSocialProfileActive {
  constructor(
    profiles: SocialProfileRepository,
    assignments: BunshinCapabilityAssignmentRepository,
  ) {
    super(profiles, assignments, true);
  }
}

export class DeactivateSocialProfile extends SetSocialProfileActive {
  constructor(
    profiles: SocialProfileRepository,
    assignments: BunshinCapabilityAssignmentRepository,
  ) {
    super(profiles, assignments, false);
  }
}

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

export interface ContentPillar {
  id: string;
  workspaceId: string;
  bunshinId: string;
  title: string;
  description: string | null;
  weight: number;
  active: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateContentPillarInput {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
  title: string;
  description?: string | null;
  weight: number;
}

export interface UpdateContentPillarInput {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
  pillarId: string;
  title?: string;
  description?: string | null;
  weight?: number;
}

export interface ContentPillarRepository {
  create(input: CreateContentPillarInput): Promise<ContentPillar | null>;
  list(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }): Promise<ContentPillar[] | null>;
  find(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
  }): Promise<ContentPillar | null>;
  update(input: UpdateContentPillarInput): Promise<ContentPillar | null>;
  setActive(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
    active: boolean;
  }): Promise<ContentPillar | null>;
  softDelete(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
  }): Promise<ContentPillar | null>;
}

function pillarTitle(value: string) {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 100) {
    throw new ApplicationError('VALIDATION_ERROR', 'title must contain 1 to 100 characters');
  }
  return normalized;
}

function pillarDescription(value: string | null): string | null;
function pillarDescription(value: undefined): undefined;
function pillarDescription(value: string | null | undefined): string | null | undefined;
function pillarDescription(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value.trim().length === 0) return null;
  const normalized = value.trim();
  if (normalized.length > 500) {
    throw new ApplicationError('VALIDATION_ERROR', 'description exceeds 500 characters');
  }
  return normalized;
}

function pillarWeight(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new ApplicationError('VALIDATION_ERROR', 'weight must be an integer from 1 to 100');
  }
  return value;
}

export function normalizeCreateContentPillarInput(
  input: CreateContentPillarInput,
): CreateContentPillarInput {
  return {
    workspaceId: input.workspaceId,
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    actorUserId: input.actorUserId,
    bunshinId: input.bunshinId,
    title: pillarTitle(input.title),
    ...(input.description === undefined
      ? {}
      : { description: pillarDescription(input.description) }),
    weight: pillarWeight(input.weight),
  };
}

export function normalizeUpdateContentPillarInput(
  input: UpdateContentPillarInput,
): UpdateContentPillarInput {
  if (input.title === undefined && input.description === undefined && input.weight === undefined) {
    throw new ApplicationError('VALIDATION_ERROR', 'at least one update field is required');
  }
  return {
    workspaceId: input.workspaceId,
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    actorUserId: input.actorUserId,
    bunshinId: input.bunshinId,
    pillarId: input.pillarId,
    ...(input.title === undefined ? {} : { title: pillarTitle(input.title) }),
    ...(input.description === undefined
      ? {}
      : { description: pillarDescription(input.description) }),
    ...(input.weight === undefined ? {} : { weight: pillarWeight(input.weight) }),
  };
}

abstract class ContentPillarMutation {
  constructor(
    protected readonly pillars: ContentPillarRepository,
    private readonly assignments: BunshinCapabilityAssignmentRepository,
  ) {}
  protected async requireActive(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }) {
    await new RequireActiveBunshinCapability(this.assignments).execute({
      ...input,
      capabilityType: 'SOCIAL',
    });
  }
}

export class CreateContentPillar extends ContentPillarMutation {
  async execute(input: CreateContentPillarInput) {
    const normalized = normalizeCreateContentPillarInput(input);
    await this.requireActive(normalized);
    const value = await this.pillars.create(normalized);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return value;
  }
}

export class ListContentPillars {
  constructor(private readonly pillars: ContentPillarRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }) {
    const values = await this.pillars.list(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return values;
  }
}

export class GetContentPillar {
  constructor(private readonly pillars: ContentPillarRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
  }) {
    const value = await this.pillars.find(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'content pillar not found');
    return value;
  }
}

export class UpdateContentPillar extends ContentPillarMutation {
  async execute(input: UpdateContentPillarInput) {
    const normalized = normalizeUpdateContentPillarInput(input);
    await this.requireActive(normalized);
    const value = await this.pillars.update(normalized);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'content pillar not found');
    return value;
  }
}

abstract class SetContentPillarActive extends ContentPillarMutation {
  constructor(
    pillars: ContentPillarRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly active: boolean,
  ) {
    super(pillars, assignments);
  }
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
  }) {
    await this.requireActive(input);
    const value = await this.pillars.setActive({ ...input, active: this.active });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'content pillar not found');
    return value;
  }
}

export class ActivateContentPillar extends SetContentPillarActive {
  constructor(p: ContentPillarRepository, a: BunshinCapabilityAssignmentRepository) {
    super(p, a, true);
  }
}
export class DeactivateContentPillar extends SetContentPillarActive {
  constructor(p: ContentPillarRepository, a: BunshinCapabilityAssignmentRepository) {
    super(p, a, false);
  }
}

export class DeleteContentPillar extends ContentPillarMutation {
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
  }) {
    await this.requireActive(input);
    const value = await this.pillars.softDelete(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'content pillar not found');
    return value;
  }
}

export const WEEKLY_PLAN_STATUSES = ['DRAFT', 'CONFIRMED', 'EXPIRED'] as const;
export type WeeklyPlanStatus = (typeof WEEKLY_PLAN_STATUSES)[number];

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
      const campaign = item.campaignId ? campaigns.get(item.campaignId) : null;
      if (item.classification === 'ORGANIC' && item.campaignId !== null)
        throw new ApplicationError('VALIDATION_ERROR', 'organic item cannot use campaign');
      if (item.classification !== 'ORGANIC' && !campaign)
        throw new ApplicationError('VALIDATION_ERROR', 'campaign item is outside context');
      return {
        scheduledDate,
        contentPillarId: item.contentPillarId,
        goal: weeklyText(item.goal, 200, 'goal'),
        angle: weeklyText(item.angle, 500, 'angle'),
        recommendedFormat: weeklyFormat(item.recommendedFormat),
        notes: weeklyNullable(item.notes, 1000) ?? null,
        campaignId: item.campaignId,
        classification: validateEnum(
          item.classification,
          ['ORGANIC', 'PRODUCT_RELATED', 'ADVERTISEMENT'] as const,
          'classification',
        ),
      };
    });
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

function localDate(value: string, monday = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid local date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value ||
    (monday && date.getUTCDay() !== 1)
  )
    throw new ApplicationError(
      'VALIDATION_ERROR',
      monday ? 'week must start on Monday' : 'invalid local date',
    );
  return value;
}
function timezone(value: string) {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 64)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid timezone');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid timezone', error);
  }
  return normalized;
}
function weeklyText(value: string, maximum: number, field: string) {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
}
function weeklyNullable(value: string | null, maximum: number): string | null;
function weeklyNullable(value: undefined, maximum: number): undefined;
function weeklyNullable(
  value: string | null | undefined,
  maximum: number,
): string | null | undefined;
function weeklyNullable(value: string | null | undefined, maximum: number) {
  if (value === undefined) return undefined;
  if (value === null || value.trim().length === 0) return null;
  return weeklyText(value, maximum, 'text');
}
function weeklyFormat(value: SocialPreferredFormat) {
  return validateEnum(value, SOCIAL_PREFERRED_FORMATS, 'recommendedFormat');
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
  approvedStrategy: SocialAccountStrategy;
  weeklyPlan: WeeklyPlan;
  contentPillars: ContentPillar[];
  grantedKnowledge: Array<{ type: string; title: string; content: string }>;
  trendIdeas?: TrendIdeaCandidate[];
  campaign?: CampaignPlanningContext | null;
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
  };
  campaign?: CampaignPlanningContext | null;
  contentPillar: { title: string; description: string | null };
  grantedKnowledge: DailyMissionPlannerInput['grantedKnowledge'];
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
      },
      campaign: input.campaign ?? null,
      contentPillar: { title: pillar.title, description: pillar.description },
      grantedKnowledge: input.grantedKnowledge,
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
    return {
      ...result,
      output: {
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
        ...(result.output.usedTrendIdea ? { trendCandidateId: trendIdeas[0]!.id } : {}),
      } satisfies DailyMissionBrief,
    };
  }
}

export interface MissionContentGeneratorInput {
  platform: SocialPlatform;
  brief: DailyMissionBrief;
  bunshin: DailyMissionPlannerInput['bunshin'];
  approvedStrategy: DailyMissionPlannerProviderInput['approvedStrategy'];
  contentPillar: { title: string; description: string | null };
  grantedKnowledge: DailyMissionPlannerInput['grantedKnowledge'];
  groupKnowledge?: Array<{
    chunkId: string;
    sourceId: string;
    type: 'GENERAL' | 'FACT' | 'FAQ' | 'RULE';
    sourceLabel: string;
    content: string;
  }>;
  selectedMemories: SelectedBunshinMemory[];
  campaign?: CampaignPlanningContext | null;
  repairInstructions?: string[];
}

export interface MissionContentGeneratorProviderInput extends Omit<
  MissionContentGeneratorInput,
  'brief' | 'selectedMemories'
> {
  brief: Pick<
    DailyMissionBrief,
    'missionDate' | 'format' | 'topic' | 'angle' | 'reason' | 'estimatedMinutes'
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
    if (input.repairInstructions !== undefined) {
      if (input.repairInstructions.length < 1 || input.repairInstructions.length > 10)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid repair instructions');
      input.repairInstructions = input.repairInstructions.map((value) =>
        missionString(value, 500, 'repair instruction'),
      );
    }
    const { missionDate, format, topic, angle, reason, estimatedMinutes } = input.brief;
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
      brief: { missionDate, format, topic, angle, reason, estimatedMinutes },
      selectedMemories,
    });
    const output = normalizeMissionContent(input.brief.format, result.output);
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
  selectedMemories: SelectedBunshinMemory[];
  groupKnowledge?: MissionContentGeneratorInput['groupKnowledge'];
}

export interface MissionQualityCheckerProviderInput extends Omit<
  MissionQualityCheckerInput,
  'brief' | 'selectedMemories'
> {
  brief: Pick<
    DailyMissionBrief,
    'missionDate' | 'format' | 'topic' | 'angle' | 'reason' | 'estimatedMinutes'
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

export class CheckMissionQuality {
  constructor(private readonly checker: MissionQualityCheckerPort) {}

  async execute(input: MissionQualityCheckerInput) {
    assertPlatformFormat(input.platform, input.brief.format);
    const content = normalizeMissionContent(input.brief.format, input.content);
    const { missionDate, format, topic, angle, reason, estimatedMinutes } = input.brief;
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
      brief: { missionDate, format, topic, angle, reason, estimatedMinutes },
      content,
      selectedMemories,
    });
    const score = missionInteger(result.output.score, 0, 100, 'quality score');
    if (!Array.isArray(result.output.issues) || result.output.issues.length > 10)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid quality issues');
    const issues = result.output.issues.map((value) => {
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
    const verdict = score < 70 ? 'REJECT' : result.output.verdict;
    return {
      ...result,
      output: { verdict, score, issues },
    };
  }
}

export const DAILY_MISSION_STATUSES = [
  'GENERATED',
  'VIEWED',
  'STARTED',
  'COMPLETED',
  'SKIPPED',
  'EXPIRED',
] as const;
export type DailyMissionStatus = (typeof DAILY_MISSION_STATUSES)[number];
export type MissionContent = Record<string, unknown>;
export interface MissionTrendContext {
  id: string;
  candidateId: string;
  snapshot: {
    candidate: {
      topic: string;
      hook: string;
      whyNow: string;
      fitReason: string;
      platform: SocialPlatform;
      format: SocialPreferredFormat;
      freshnessScore: number;
      fitScore: number;
      feasibilityScore: number;
    };
    evidence: Array<{
      sourceType: TrendEvidenceSourceType;
      sourceUrl: string;
      sourceTitle: string;
      publishedAt: string | null;
      retrievedAt: string;
      summary: string;
    }>;
  };
  createdAt: Date;
}
export interface DailyMission {
  id: string;
  workspaceId: string;
  bunshinId: string;
  socialProfileId: string | null;
  weeklyPlanItemId: string | null;
  campaignId: string | null;
  classification: CampaignContentClassification;
  missionDate: string;
  status: DailyMissionStatus;
  format: SocialPreferredFormat;
  assistanceLevel: ContentAssistanceLevel;
  estimatedMinutes: number;
  topic: string;
  angle: string;
  reason: string;
  qualityScore: number | null;
  viewedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  skippedAt: Date | null;
  expiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  content: MissionContent;
  trendContext?: MissionTrendContext | null;
  linkUsage?: {
    linkName: string;
    insertedUrl: string;
    expiresAt: Date | null;
    productName: string;
    campaignName: string | null;
    advertisingClassification: CampaignContentClassification;
  } | null;
}
export interface DailyMissionScope {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
}
export interface CreateDailyMissionInput extends DailyMissionScope {
  socialProfileId?: string | null;
  weeklyPlanItemId?: string | null;
  campaignId?: string | null;
  classification?: CampaignContentClassification;
  missionDate: string;
  format: SocialPreferredFormat;
  assistanceLevel?: ContentAssistanceLevel;
  estimatedMinutes: number;
  topic: string;
  angle: string;
  reason: string;
  content: MissionContent;
  qualityScore?: number | null;
  trendCandidateId?: string | null;
  generationContext?: {
    payload: GenerationContextSnapshotPayload;
    generatedAt: Date;
  };
  externalLinkUsage?: {
    groupId: string;
    productPackId: string;
    productPackVersionId: string;
    campaignId: string;
    externalTrackingLinkId: string;
    insertedUrl: string;
    placementTemplateId: string | null;
    placementTemplateVersion: number | null;
  };
}
export interface DailyMissionRepository {
  create(input: CreateDailyMissionInput): Promise<DailyMission | null>;
  list(input: DailyMissionScope & { from?: string; to?: string }): Promise<DailyMission[] | null>;
  find(input: DailyMissionScope & { dailyMissionId: string }): Promise<DailyMission | null>;
  transition(
    input: DailyMissionScope & { dailyMissionId: string; status: DailyMissionStatus },
  ): Promise<DailyMission | null>;
  authorizeCopy(input: DailyMissionScope & { dailyMissionId: string; at: Date }): Promise<{
    allowed: boolean;
    reason:
      | 'READY'
      | 'LINK_CHANGED'
      | 'LINK_UNAVAILABLE'
      | 'APPROVAL_PENDING'
      | 'APPROVAL_CHANGES_REQUESTED';
    reviewNote?: string | null;
  } | null>;
}

const missionString = (value: unknown, maximum: number, field: string) => {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value.trim();
};
const missionInteger = (value: unknown, minimum: number, maximum: number, field: string) => {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value as number;
};
const PLATFORM_FORMATS: Record<SocialPlatform, readonly SocialPreferredFormat[]> = {
  INSTAGRAM: ['TEXT', 'SLIDE', 'IMAGE', 'LIVE_ACTION', 'AI_VIDEO_PROMPT'],
  TIKTOK: ['LIVE_ACTION', 'AI_VIDEO_PROMPT', 'IMAGE'],
  X: ['TEXT', 'IMAGE'],
  THREADS: ['TEXT', 'IMAGE'],
  YOUTUBE_SHORTS: ['LIVE_ACTION', 'AI_VIDEO_PROMPT'],
  OTHER: SOCIAL_PREFERRED_FORMATS,
};
export function assertPlatformFormat(platform: SocialPlatform, format: SocialPreferredFormat) {
  if (!PLATFORM_FORMATS[platform].includes(format))
    throw new ApplicationError('VALIDATION_ERROR', 'format is not supported for platform');
}
function validatePlatformContent(
  platform: SocialPlatform,
  brief: DailyMissionBrief,
  content: MissionContent,
) {
  const estimated = content['estimatedMinutes'];
  if (typeof estimated === 'number' && estimated > brief.estimatedMinutes)
    throw new ApplicationError('VALIDATION_ERROR', 'content exceeds estimated minutes');
  const hashtags = content['hashtags'];
  const hashtagLimit = platform === 'INSTAGRAM' ? 30 : 5;
  if (Array.isArray(hashtags) && hashtags.length > hashtagLimit)
    throw new ApplicationError('VALIDATION_ERROR', 'too many hashtags for platform');
  if (brief.format === 'TEXT') {
    const limit = platform === 'X' ? 280 : platform === 'THREADS' ? 500 : 2200;
    if (typeof content['body'] === 'string' && content['body'].length > limit)
      throw new ApplicationError('VALIDATION_ERROR', 'text exceeds platform limit');
    if (
      Array.isArray(content['threadParts']) &&
      content['threadParts'].some((value) => typeof value === 'string' && value.length > limit)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'thread part exceeds platform limit');
  }
  if (brief.format === 'AI_VIDEO_PROMPT') {
    const settings = content['videoSettings'];
    if (
      settings &&
      typeof settings === 'object' &&
      'durationSeconds' in settings &&
      typeof settings.durationSeconds === 'number' &&
      settings.durationSeconds > 60
    )
      throw new ApplicationError('VALIDATION_ERROR', 'video duration exceeds platform limit');
  }
}
function strict(value: unknown, keys: readonly string[], field: string) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value as Record<string, unknown>;
}
function strings(value: unknown, maximumItems: number, maximumLength: number, field: string) {
  if (!Array.isArray(value) || value.length > maximumItems)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value.map((item) => missionString(item, maximumLength, field));
}
function missionNullableString(value: unknown, maximum: number, field: string) {
  return value === null || value === undefined ? null : missionString(value, maximum, field);
}
export function normalizeMissionContent(
  format: SocialPreferredFormat,
  value: unknown,
): MissionContent {
  if (format === 'TEXT') {
    const v = strict(value, ['body', 'threadParts', 'cta', 'caption', 'hashtags'], 'text content');
    return {
      body: missionString(v['body'], 10000, 'body'),
      threadParts: strings(v['threadParts'], 25, 2000, 'thread parts'),
      cta: missionNullableString(v['cta'], 1000, 'cta'),
      caption: missionNullableString(v['caption'], 2200, 'caption'),
      hashtags: strings(v['hashtags'], 30, 100, 'hashtags'),
    };
  }
  if (format === 'SLIDE') {
    const v = strict(
      value,
      ['topic', 'angle', 'reason', 'estimatedMinutes', 'slides', 'caption', 'hashtags'],
      'slide content',
    );
    if (!Array.isArray(v['slides']) || v['slides'].length < 1 || v['slides'].length > 7)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid slides');
    const slides = v['slides'].map((entry, index) => {
      const slide = strict(entry, ['index', 'role', 'headline', 'body'], 'slide');
      const role = missionString(slide['role'], 20, 'slide role');
      if (!['HOOK', 'PROBLEM', 'INSIGHT', 'SOLUTION', 'CTA'].includes(role))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid slide role');
      if (slide['index'] !== index + 1)
        throw new ApplicationError('VALIDATION_ERROR', 'slide index must be sequential');
      return {
        index: index + 1,
        role,
        headline: missionString(slide['headline'], 200, 'headline'),
        body: missionString(slide['body'], 2000, 'body'),
      };
    });
    if (slides[0]?.role !== 'HOOK' || slides.at(-1)?.role !== 'CTA')
      throw new ApplicationError('VALIDATION_ERROR', 'slides require HOOK and CTA');
    return {
      topic: missionString(v['topic'], 200, 'topic'),
      angle: missionString(v['angle'], 500, 'angle'),
      reason: missionString(v['reason'], 1000, 'reason'),
      estimatedMinutes: missionInteger(v['estimatedMinutes'], 1, 120, 'estimated minutes'),
      slides,
      caption: missionString(v['caption'], 2200, 'caption'),
      hashtags: strings(v['hashtags'], 30, 100, 'hashtags'),
    };
  }
  if (format === 'LIVE_ACTION') {
    const v = strict(
      value,
      ['topic', 'estimatedMinutes', 'shootingInstruction', 'script', 'caption'],
      'live action content',
    );
    if (!Array.isArray(v['script']) || v['script'].length < 1 || v['script'].length > 20)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid script');
    const script = v['script'].map((entry) => {
      const part = strict(entry, ['seconds', 'role', 'text'], 'script part');
      const role = missionString(part['role'], 10, 'script role');
      if (!['HOOK', 'BODY', 'CTA'].includes(role))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid script role');
      return {
        seconds: missionString(part['seconds'], 30, 'seconds'),
        role,
        text: missionString(part['text'], 2000, 'script text'),
      };
    });
    if (script[0]?.role !== 'HOOK' || script.at(-1)?.role !== 'CTA')
      throw new ApplicationError('VALIDATION_ERROR', 'script requires HOOK and CTA');
    return {
      topic: missionString(v['topic'], 200, 'topic'),
      estimatedMinutes: missionInteger(v['estimatedMinutes'], 1, 120, 'estimated minutes'),
      shootingInstruction: missionString(v['shootingInstruction'], 2000, 'shooting instruction'),
      script,
      caption: missionString(v['caption'], 2200, 'caption'),
    };
  }
  if (format === 'AI_VIDEO_PROMPT') {
    const v = strict(
      value,
      [
        'topic',
        'estimatedMinutes',
        'toolSuggestion',
        'videoSettings',
        'prompt',
        'overlayText',
        'caption',
      ],
      'video content',
    );
    const settings = strict(
      v['videoSettings'],
      ['aspectRatio', 'durationSeconds', 'style'],
      'video settings',
    );
    return {
      topic: missionString(v['topic'], 200, 'topic'),
      estimatedMinutes: missionInteger(v['estimatedMinutes'], 1, 120, 'estimated minutes'),
      toolSuggestion:
        v['toolSuggestion'] === null
          ? null
          : missionString(v['toolSuggestion'], 100, 'tool suggestion'),
      videoSettings: {
        aspectRatio: missionString(settings['aspectRatio'], 20, 'aspect ratio'),
        durationSeconds: missionInteger(settings['durationSeconds'], 1, 120, 'duration seconds'),
        style: missionString(settings['style'], 500, 'style'),
      },
      prompt: missionString(v['prompt'], 10000, 'prompt'),
      overlayText: strings(v['overlayText'], 20, 200, 'overlay text'),
      caption: missionString(v['caption'], 2200, 'caption'),
    };
  }
  const v = strict(
    value,
    [
      'topic',
      'angle',
      'reason',
      'estimatedMinutes',
      'imageInstruction',
      'overlayText',
      'caption',
      'hashtags',
    ],
    'image content',
  );
  return {
    topic: missionString(v['topic'], 200, 'topic'),
    angle: missionString(v['angle'], 500, 'angle'),
    reason: missionString(v['reason'], 1000, 'reason'),
    estimatedMinutes: missionInteger(v['estimatedMinutes'], 1, 120, 'estimated minutes'),
    imageInstruction: missionString(v['imageInstruction'], 5000, 'image instruction'),
    overlayText:
      v['overlayText'] === null ? null : missionString(v['overlayText'], 500, 'overlay text'),
    caption: missionString(v['caption'], 2200, 'caption'),
    hashtags: strings(v['hashtags'], 30, 100, 'hashtags'),
  };
}
export function normalizeCreateDailyMission(
  input: CreateDailyMissionInput,
): CreateDailyMissionInput {
  const format = weeklyFormat(input.format);
  const classification = validateEnum(
    input.classification ?? 'ORGANIC',
    ['ORGANIC', 'PRODUCT_RELATED', 'ADVERTISEMENT'] as const,
    'classification',
  );
  if ((classification === 'ORGANIC') !== !input.campaignId)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid campaign classification');
  const quality =
    input.qualityScore === undefined || input.qualityScore === null
      ? input.qualityScore
      : missionInteger(input.qualityScore, 0, 100, 'quality score');
  if (input.generationContext) validateGenerationContextSnapshot(input.generationContext.payload);
  if (input.externalLinkUsage) {
    if (classification === 'ORGANIC' || input.externalLinkUsage.campaignId !== input.campaignId)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid external link usage');
    let url: URL;
    try {
      url = new URL(input.externalLinkUsage.insertedUrl);
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid external link usage');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid external link usage');
  }
  return {
    ...input,
    missionDate: localDate(input.missionDate),
    format,
    campaignId: input.campaignId ?? null,
    classification,
    assistanceLevel: parseContentAssistanceLevel(
      input.assistanceLevel ?? DEFAULT_CONTENT_ASSISTANCE_LEVEL,
    ),
    estimatedMinutes: missionInteger(input.estimatedMinutes, 1, 120, 'estimated minutes'),
    topic: missionString(input.topic, 200, 'topic'),
    angle: missionString(input.angle, 500, 'angle'),
    reason: missionString(input.reason, 1000, 'reason'),
    content: normalizeMissionContent(format, input.content),
    ...(quality === undefined ? {} : { qualityScore: quality }),
  };
}
abstract class DailyMissionMutation {
  constructor(
    protected readonly missions: DailyMissionRepository,
    private readonly assignments: BunshinCapabilityAssignmentRepository,
  ) {}
  protected requireActive(input: DailyMissionScope) {
    return new RequireActiveBunshinCapability(this.assignments).execute({
      ...input,
      capabilityType: 'SOCIAL',
    });
  }
}
export class CreateDailyMission extends DailyMissionMutation {
  async execute(input: CreateDailyMissionInput) {
    await this.requireActive(input);
    const value = await this.missions.create(normalizeCreateDailyMission(input));
    if (!value) throw new ApplicationError('NOT_FOUND', 'bunshin or relation not found');
    return value;
  }
}
export class ListDailyMissions {
  constructor(private readonly missions: DailyMissionRepository) {}
  async execute(input: DailyMissionScope & { from?: string; to?: string }) {
    const from = input.from === undefined ? undefined : localDate(input.from);
    const to = input.to === undefined ? undefined : localDate(input.to);
    if (
      from &&
      to &&
      (from > to || (new Date(to).valueOf() - new Date(from).valueOf()) / 86400000 > 89)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid mission date range');
    const value = await this.missions.list({
      ...input,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return value;
  }
}
export class GetDailyMission {
  constructor(private readonly missions: DailyMissionRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.missions.find(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}
export class AuthorizeDailyMissionCopy {
  constructor(private readonly missions: DailyMissionRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string; at?: Date }) {
    const value = await this.missions.authorizeCopy({ ...input, at: input.at ?? new Date() });
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}
export class TransitionDailyMission extends DailyMissionMutation {
  async execute(input: DailyMissionScope & { dailyMissionId: string; status: DailyMissionStatus }) {
    await this.requireActive(input);
    if (!DAILY_MISSION_STATUSES.includes(input.status))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid mission status');
    const value = await this.missions.transition(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}

export const MISSION_DECISIONS = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type MissionDecisionValue = (typeof MISSION_DECISIONS)[number];
export const MISSION_REJECTION_REASONS = [
  'NOT_MY_STYLE',
  'WRONG_TOPIC',
  'TOO_DIFFICULT',
  'TOO_MUCH_WORK',
  'SIMILAR_TO_PAST',
  'TOO_SALESY',
  'NOT_TODAY',
  'OTHER',
] as const;
export type MissionRejectionReason = (typeof MISSION_REJECTION_REASONS)[number];
export const MISSION_ACTIVITY_TYPES = [
  'VIEWED',
  'CONFIRMED',
  'RESTED',
  'ACCEPTED',
  'REJECTED',
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
  'POSTED',
  'FEEDBACK_GOOD',
  'FEEDBACK_NEUTRAL',
  'FEEDBACK_BAD',
] as const;
export type MissionActivityType = (typeof MISSION_ACTIVITY_TYPES)[number];
export interface MissionDecision {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  decision: MissionDecisionValue;
  rejectionReason: MissionRejectionReason | null;
  rejectionDetail: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface MissionActivity {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  type: MissionActivityType;
  occurredAt: Date;
  idempotencyKey: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}
export interface MissionProgressDaySource {
  dailyMissionId: string;
  missionDate: string;
  activities: MissionActivity[];
}
export type MissionProgressDayStatus = 'UNSEEN' | 'CONFIRMED' | 'PREPARED' | 'POSTED' | 'RESTED';
export interface MissionProgressDay {
  dailyMissionId: string;
  missionDate: string;
  status: MissionProgressDayStatus;
}
export interface MissionProgress {
  weekStart: string;
  weekEnd: string;
  weeklyGoal: number;
  remainingConfirmations: number;
  weekly: {
    confirmedDays: number;
    preparedDays: number;
    postedDays: number;
    restedDays: number;
    days: MissionProgressDay[];
  };
  cumulative: {
    confirmedDays: number;
    preparedDays: number;
    postedDays: number;
    restedDays: number;
    activeDays: number;
    lastActiveDate: string | null;
  };
}
export interface MissionEngagementRepository {
  getDecision(
    input: DailyMissionScope & { dailyMissionId: string },
  ): Promise<MissionDecision | null>;
  decide(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    decision: 'ACCEPTED' | 'REJECTED';
    rejectionReason: MissionRejectionReason | null;
    rejectionDetail: string | null;
    idempotencyKey: string;
  }): Promise<{ decision: MissionDecision; activity: MissionActivity } | null>;
  listActivities(
    input: DailyMissionScope & { dailyMissionId: string },
  ): Promise<MissionActivity[] | null>;
  appendActivity(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    type:
      | 'VIEWED'
      | 'CONFIRMED'
      | 'RESTED'
      | 'COPIED_TEXT'
      | 'COPIED_SLIDE'
      | 'COPIED_IMAGE_INSTRUCTION'
      | 'COPIED_VIDEO_PROMPT'
      | 'COPIED_SCRIPT';
    idempotencyKey: string;
    metadata: Record<string, unknown> | null;
  }): Promise<MissionActivity | null>;
  listProgressDays(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    from: string | null;
    to: string;
  }): Promise<MissionProgressDaySource[] | null>;
}

function idempotencyKey(value: string) {
  return missionString(value, 200, 'idempotency key');
}
export function normalizeMissionActivityMetadata(
  type: MissionActivityType,
  metadata: unknown,
): Record<string, unknown> | null {
  if (type === 'COPIED_SLIDE') {
    if (metadata === null || metadata === undefined) return null;
    const value = strict(metadata, ['slideIndex'], 'activity metadata');
    return { slideIndex: missionInteger(value['slideIndex'], 1, 7, 'slide index') };
  }
  if (metadata !== null && metadata !== undefined)
    throw new ApplicationError('VALIDATION_ERROR', 'activity metadata is not allowed');
  return null;
}

export class GetMissionDecision {
  constructor(private readonly engagement: MissionEngagementRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.engagement.getDecision(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'mission decision not found');
    return value;
  }
}
export class DecideMission extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly engagement: MissionEngagementRepository,
  ) {
    super(missions, assignments);
  }
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    decision: 'ACCEPTED' | 'REJECTED';
    rejectionReason?: MissionRejectionReason | null;
    rejectionDetail?: string | null;
    idempotencyKey: string;
  }) {
    await this.requireActive(input);
    const rejectionReason = input.rejectionReason ?? null;
    const rejectionDetail = input.rejectionDetail?.trim() || null;
    if (input.decision === 'ACCEPTED' && (rejectionReason !== null || rejectionDetail !== null))
      throw new ApplicationError('VALIDATION_ERROR', 'accepted decision cannot have rejection');
    if (input.decision === 'REJECTED' && !rejectionReason)
      throw new ApplicationError('VALIDATION_ERROR', 'rejection reason is required');
    if (rejectionReason && !MISSION_REJECTION_REASONS.includes(rejectionReason))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rejection reason');
    if (rejectionReason !== 'OTHER' && rejectionDetail !== null)
      throw new ApplicationError('VALIDATION_ERROR', 'rejection detail is only allowed for OTHER');
    if (rejectionDetail && rejectionDetail.length > 1000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rejection detail');
    const value = await this.engagement.decide({
      ...input,
      rejectionReason,
      rejectionDetail,
      idempotencyKey: idempotencyKey(input.idempotencyKey),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}
export class ListMissionActivities {
  constructor(private readonly engagement: MissionEngagementRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.engagement.listActivities(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}
export class RecordMissionActivity extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly engagement: MissionEngagementRepository,
  ) {
    super(missions, assignments);
  }
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    type:
      | 'VIEWED'
      | 'CONFIRMED'
      | 'RESTED'
      | 'COPIED_TEXT'
      | 'COPIED_SLIDE'
      | 'COPIED_IMAGE_INSTRUCTION'
      | 'COPIED_VIDEO_PROMPT'
      | 'COPIED_SCRIPT';
    idempotencyKey: string;
    metadata?: Record<string, unknown> | null;
  }) {
    await this.requireActive(input);
    const value = await this.engagement.appendActivity({
      ...input,
      idempotencyKey: idempotencyKey(input.idempotencyKey),
      metadata: normalizeMissionActivityMetadata(input.type, input.metadata),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}

const COPY_ACTIVITY_TYPES = new Set<MissionActivityType>([
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
]);

function progressDay(source: MissionProgressDaySource): MissionProgressDay {
  const types = new Set(source.activities.map((value) => value.type));
  const status: MissionProgressDayStatus = types.has('POSTED')
    ? 'POSTED'
    : source.activities.some((value) => COPY_ACTIVITY_TYPES.has(value.type))
      ? 'PREPARED'
      : types.has('CONFIRMED')
        ? 'CONFIRMED'
        : types.has('RESTED')
          ? 'RESTED'
          : 'UNSEEN';
  return { dailyMissionId: source.dailyMissionId, missionDate: source.missionDate, status };
}

function progressCounts(days: MissionProgressDay[]) {
  return {
    confirmedDays: days.filter((value) =>
      ['CONFIRMED', 'PREPARED', 'POSTED'].includes(value.status),
    ).length,
    preparedDays: days.filter((value) => ['PREPARED', 'POSTED'].includes(value.status)).length,
    postedDays: days.filter((value) => value.status === 'POSTED').length,
    restedDays: days.filter((value) => value.status === 'RESTED').length,
  };
}

export class GetMissionProgress {
  constructor(
    private readonly assignments: BunshinCapabilityAssignmentRepository,
    private readonly engagement: MissionEngagementRepository,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    weekStart: string;
    weekEnd: string;
    weeklyGoal?: number;
  }): Promise<MissionProgress> {
    await new RequireActiveBunshinCapability(this.assignments).execute({
      workspaceId: input.workspaceId,
      ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
      actorUserId: input.actorUserId,
      bunshinId: input.bunshinId,
      capabilityType: 'SOCIAL',
    });
    const weekStart = localDate(input.weekStart);
    const weekEnd = localDate(input.weekEnd);
    const duration = (new Date(weekEnd).valueOf() - new Date(weekStart).valueOf()) / 86400000;
    if (duration < 0 || duration > 6)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid progress week');
    const weeklyGoal = missionInteger(input.weeklyGoal ?? 3, 1, 7, 'weekly goal');
    const scope = {
      workspaceId: input.workspaceId,
      ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
      actorUserId: input.actorUserId,
      bunshinId: input.bunshinId,
    };
    const [weeklySource, cumulativeSource] = await Promise.all([
      this.engagement.listProgressDays({ ...scope, from: weekStart, to: weekEnd }),
      this.engagement.listProgressDays({ ...scope, from: null, to: weekEnd }),
    ]);
    if (!weeklySource || !cumulativeSource)
      throw new ApplicationError('NOT_FOUND', 'mission progress not found');
    const weeklyDays = weeklySource.map(progressDay);
    const cumulativeDays = cumulativeSource.map(progressDay);
    const weekly = progressCounts(weeklyDays);
    const cumulative = progressCounts(cumulativeDays);
    const activeDates = cumulativeDays
      .filter((value) => value.status !== 'UNSEEN')
      .map((value) => value.missionDate);
    return {
      weekStart,
      weekEnd,
      weeklyGoal,
      remainingConfirmations: Math.max(0, weeklyGoal - weekly.confirmedDays),
      weekly: { ...weekly, days: weeklyDays },
      cumulative: {
        ...cumulative,
        activeDays: cumulativeDays.filter((value) => value.status !== 'UNSEEN').length,
        lastActiveDate: activeDates.at(-1) ?? null,
      },
    };
  }
}

export const ACTIVITY_MOTIVATION_RULE = {
  featureKey: 'SOCIAL',
  ruleVersion: DEFAULT_ACTIVITY_CONTINUITY_RULE.version,
  dormancyDays: DEFAULT_ACTIVITY_CONTINUITY_RULE.dormancyDays,
  badges: DEFAULT_ACTIVITY_CONTINUITY_RULE.badges,
} as const;
export interface AchievementBadge {
  id: string;
  workspaceId: string;
  userId: string;
  bunshinId: string;
  featureKey: string;
  badgeKey: string;
  ruleVersion: number;
  labelSnapshot: string;
  descriptionSnapshot: string;
  awardedAt: Date;
}
export interface AchievementBadgeRepository {
  list(input: {
    workspaceId: string;
    userId: string;
    bunshinId: string;
    featureKey: string;
  }): Promise<AchievementBadge[] | null>;
  award(input: Omit<AchievementBadge, 'id' | 'awardedAt'>): Promise<AchievementBadge | null>;
}
export type ActivityStep = 'STARTING' | 'BUILDING' | 'CONTINUING' | 'ESTABLISHED';
export interface ActivityMotivation {
  step: ActivityStep;
  stepLabel: string;
  dormant: boolean;
  dormantSinceDays: number | null;
  returnMessage: string | null;
  badges: AchievementBadge[];
}
function activityStep(
  activeDays: number,
  rule: ActivityContinuityRule,
): { step: ActivityStep; stepLabel: string } {
  if (activeDays >= rule.stepEstablishedDays)
    return { step: 'ESTABLISHED', stepLabel: '発信が習慣になっています' };
  if (activeDays >= rule.stepContinuingDays)
    return { step: 'CONTINUING', stepLabel: '発信を続けています' };
  if (activeDays >= rule.stepBuildingDays)
    return { step: 'BUILDING', stepLabel: '発信の準備が整ってきました' };
  return { step: 'STARTING', stepLabel: 'はじめの一歩' };
}
export class EvaluateActivityMotivation {
  constructor(private readonly badges: AchievementBadgeRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    progress: MissionProgress;
    localDate: string;
    rule?: ActivityContinuityRule;
  }): Promise<ActivityMotivation> {
    const ruleSet = input.rule ?? DEFAULT_ACTIVITY_CONTINUITY_RULE;
    const existing = await this.badges.list({
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      bunshinId: input.bunshinId,
      featureKey: ACTIVITY_MOTIVATION_RULE.featureKey,
    });
    if (existing === null) throw new ApplicationError('NOT_FOUND', 'activity badges not found');
    const metrics = input.progress.cumulative;
    const eligible = ruleSet.badges.filter((rule) => metrics[rule.metric] >= rule.threshold);
    const awarded = await Promise.all(
      eligible.map((rule) =>
        this.badges.award({
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
          featureKey: ACTIVITY_MOTIVATION_RULE.featureKey,
          badgeKey: rule.badgeKey,
          ruleVersion: ruleSet.version,
          labelSnapshot: rule.label,
          descriptionSnapshot: rule.description,
        }),
      ),
    );
    if (awarded.some((value) => value === null))
      throw new ApplicationError('NOT_FOUND', 'activity badge scope not found');
    const merged = new Map(
      [...existing, ...(awarded as AchievementBadge[])].map((value) => [
        `${value.badgeKey}:${value.ruleVersion}`,
        value,
      ]),
    );
    const lastActiveDate = metrics.lastActiveDate;
    const dormantSinceDays = lastActiveDate
      ? Math.floor(
          (new Date(`${input.localDate}T00:00:00.000Z`).valueOf() -
            new Date(`${lastActiveDate}T00:00:00.000Z`).valueOf()) /
            86400000,
        )
      : null;
    const dormant = dormantSinceDays !== null && dormantSinceDays >= ruleSet.dormancyDays;
    return {
      ...activityStep(metrics.activeDays, ruleSet),
      dormant,
      dormantSinceDays,
      returnMessage: dormant ? 'おかえりなさい。今日は内容を見るだけでも大丈夫です。' : null,
      badges: [...merged.values()].sort(
        (left, right) => left.awardedAt.valueOf() - right.awardedAt.valueOf(),
      ),
    };
  }
}

export const POST_SOURCES = ['MANUAL'] as const;
export type PostSource = (typeof POST_SOURCES)[number];
export const MISSION_FEEDBACK_RATINGS = ['GOOD', 'NEUTRAL', 'BAD'] as const;
export type MissionFeedbackRating = (typeof MISSION_FEEDBACK_RATINGS)[number];

export interface PostRecord {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  platform: SocialPlatform;
  postedAt: Date;
  postUrl: string | null;
  externalPostId: string | null;
  source: PostSource;
  manualMetrics: Record<string, unknown> | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface MissionFeedback {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  rating: MissionFeedbackRating;
  createdAt: Date;
  updatedAt: Date;
}
export interface MissionOutcomeRepository {
  getPost(input: DailyMissionScope & { dailyMissionId: string }): Promise<PostRecord | null>;
  recordPost(
    input: DailyMissionScope & {
      dailyMissionId: string;
      platform: SocialPlatform;
      postedAt: Date;
      postUrl: string | null;
      idempotencyKey: string;
    },
  ): Promise<{ post: PostRecord; activity: MissionActivity } | null>;
  getFeedback(
    input: DailyMissionScope & { dailyMissionId: string },
  ): Promise<MissionFeedback | null>;
  recordFeedback(
    input: DailyMissionScope & {
      dailyMissionId: string;
      rating: MissionFeedbackRating;
      idempotencyKey: string;
    },
  ): Promise<{ feedback: MissionFeedback; activity: MissionActivity } | null>;
}

function postUrl(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === '') return null;
  const normalized = value.trim();
  if (normalized.length > 2048) throw new ApplicationError('VALIDATION_ERROR', 'invalid post url');
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid post url');
  }
  return normalized;
}
export class GetPostRecord {
  constructor(private readonly outcomes: MissionOutcomeRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.outcomes.getPost(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'post record not found');
    return value;
  }
}
export class RecordManualPost extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly outcomes: MissionOutcomeRepository,
  ) {
    super(missions, assignments);
  }
  async execute(
    input: DailyMissionScope & {
      dailyMissionId: string;
      platform: SocialPlatform;
      postedAt?: Date;
      postUrl?: string | null;
      idempotencyKey: string;
    },
  ) {
    await this.requireActive(input);
    if (!SOCIAL_PLATFORMS.includes(input.platform))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid platform');
    const postedAt = input.postedAt ?? new Date();
    if (Number.isNaN(postedAt.valueOf()) || postedAt.valueOf() > Date.now() + 5 * 60_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid posted at');
    const value = await this.outcomes.recordPost({
      ...input,
      postedAt,
      postUrl: postUrl(input.postUrl),
      idempotencyKey: idempotencyKey(input.idempotencyKey),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}
export class GetMissionFeedback {
  constructor(private readonly outcomes: MissionOutcomeRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.outcomes.getFeedback(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'mission feedback not found');
    return value;
  }
}
export class RecordMissionFeedback extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly outcomes: MissionOutcomeRepository,
  ) {
    super(missions, assignments);
  }
  async execute(
    input: DailyMissionScope & {
      dailyMissionId: string;
      rating: MissionFeedbackRating;
      idempotencyKey: string;
    },
  ) {
    await this.requireActive(input);
    if (!MISSION_FEEDBACK_RATINGS.includes(input.rating))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback rating');
    const value = await this.outcomes.recordFeedback({
      ...input,
      idempotencyKey: idempotencyKey(input.idempotencyKey),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'post record not found');
    return value;
  }
}

export const TREND_EVIDENCE_SOURCE_TYPES = ['OFFICIAL_API', 'PUBLIC_WEB', 'NEWS', 'OTHER'] as const;
export type TrendEvidenceSourceType = (typeof TREND_EVIDENCE_SOURCE_TYPES)[number];
export const TREND_SAFETY_STATUSES = ['SAFE', 'REVIEW_REQUIRED', 'REJECTED'] as const;
export type TrendSafetyStatus = (typeof TREND_SAFETY_STATUSES)[number];

export interface TrendEvidence {
  id: string;
  sourceType: TrendEvidenceSourceType;
  sourceUrl: string;
  sourceTitle: string;
  publishedAt: Date | null;
  retrievedAt: Date;
  summary: string;
  evidenceHash: string;
  expiresAt: Date;
}
export interface TrendIdeaCandidate {
  id: string;
  platform: SocialPlatform;
  topic: string;
  hook: string;
  whyNow: string;
  fitReason: string;
  suggestedFormat: SocialPreferredFormat;
  estimatedMinutes: number;
  freshnessScore: number;
  fitScore: number;
  feasibilityScore: number;
  safetyStatus: TrendSafetyStatus;
  expiresAt: Date;
  evidenceIds: string[];
}
export interface TrendResearchRun {
  id: string;
  workspaceId: string;
  bunshinId: string;
  socialProfileId: string;
  periodStart: string;
  periodEnd: string;
  queryVersion: string;
  providerKey: string;
  completedAt: Date;
  expiresAt: Date;
  evidence: TrendEvidence[];
  candidates: TrendIdeaCandidate[];
}
export interface CreateCompletedTrendResearchInput {
  workspaceId: string;
  actorUserId: string;
  bunshinId: string;
  socialProfileId: string;
  platform: SocialPlatform;
  periodStart: string;
  periodEnd: string;
  queryVersion: string;
  providerKey: string;
  completedAt: Date;
  expiresAt: Date;
  evidence: Array<{
    key: string;
    sourceType: TrendEvidenceSourceType;
    sourceUrl: string;
    sourceTitle: string;
    publishedAt?: Date | null;
    retrievedAt: Date;
    summary: string;
    evidenceHash: string;
    expiresAt: Date;
  }>;
  candidates: Array<{
    platform: SocialPlatform;
    topic: string;
    hook: string;
    whyNow: string;
    fitReason: string;
    suggestedFormat: SocialPreferredFormat;
    estimatedMinutes: number;
    freshnessScore: number;
    fitScore: number;
    feasibilityScore: number;
    safetyStatus: TrendSafetyStatus;
    expiresAt: Date;
    evidenceKeys: string[];
  }>;
}
export interface TrendResearchRepository {
  createCompleted(input: CreateCompletedTrendResearchInput): Promise<TrendResearchRun | null>;
  listActive(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    socialProfileId: string;
    at: Date;
  }): Promise<TrendIdeaCandidate[] | null>;
}

function trendText(value: string, maximum: number, field: string) {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
}
function trendLocalDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
}
function trendTimestamp(value: Date, field: string) {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf()))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
}
function trendScore(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0 || value > 100)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
}
function trendUrl(value: string) {
  let url: URL;
  try {
    url = new URL(trendText(value, 2048, 'source url'));
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid source url', error);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new ApplicationError('VALIDATION_ERROR', 'unsafe source url');
  return url.toString();
}
export function normalizeCompletedTrendResearchInput(input: CreateCompletedTrendResearchInput) {
  const periodStart = trendLocalDate(input.periodStart, 'period start');
  const periodEnd = trendLocalDate(input.periodEnd, 'period end');
  if (periodEnd < periodStart) throw new ApplicationError('VALIDATION_ERROR', 'invalid period');
  const completedAt = trendTimestamp(input.completedAt, 'completed at');
  const expiresAt = trendTimestamp(input.expiresAt, 'expires at');
  if (expiresAt <= completedAt)
    throw new ApplicationError('VALIDATION_ERROR', 'run must expire later');
  if (input.evidence.length < 1 || input.evidence.length > 10)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence count');
  if (input.candidates.length < 1 || input.candidates.length > 3)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid candidate count');
  const keys = new Set<string>();
  const hashes = new Set<string>();
  const evidence = input.evidence.map((item) => {
    const key = trendText(item.key, 80, 'evidence key');
    const evidenceHash = item.evidenceHash.toLowerCase();
    if (keys.has(key)) throw new ApplicationError('VALIDATION_ERROR', 'duplicate evidence key');
    if (!isOneOf(item.sourceType, TREND_EVIDENCE_SOURCE_TYPES))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence source');
    if (!/^[a-f0-9]{64}$/.test(evidenceHash) || hashes.has(evidenceHash))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence hash');
    keys.add(key);
    hashes.add(evidenceHash);
    const retrievedAt = trendTimestamp(item.retrievedAt, 'retrieved at');
    const itemExpiresAt = trendTimestamp(item.expiresAt, 'evidence expires at');
    if (itemExpiresAt <= retrievedAt)
      throw new ApplicationError('VALIDATION_ERROR', 'evidence must expire later');
    return {
      ...item,
      key,
      sourceUrl: trendUrl(item.sourceUrl),
      sourceTitle: trendText(item.sourceTitle, 500, 'source title'),
      publishedAt:
        item.publishedAt == null ? null : trendTimestamp(item.publishedAt, 'published at'),
      retrievedAt,
      summary: trendText(item.summary, 2000, 'summary'),
      evidenceHash,
      expiresAt: itemExpiresAt,
    };
  });
  const candidates = input.candidates.map((item) => {
    if (item.platform !== input.platform)
      throw new ApplicationError('VALIDATION_ERROR', 'platform mismatch');
    assertPlatformFormat(item.platform, item.suggestedFormat);
    if (!isOneOf(item.safetyStatus, TREND_SAFETY_STATUSES))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid safety status');
    if (
      item.evidenceKeys.length < 1 ||
      new Set(item.evidenceKeys).size !== item.evidenceKeys.length ||
      item.evidenceKeys.some((key) => !keys.has(key))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid candidate evidence');
    if (
      !Number.isInteger(item.estimatedMinutes) ||
      item.estimatedMinutes < 1 ||
      item.estimatedMinutes > 120
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid estimated minutes');
    const itemExpiresAt = trendTimestamp(item.expiresAt, 'candidate expires at');
    if (itemExpiresAt <= completedAt)
      throw new ApplicationError('VALIDATION_ERROR', 'candidate must expire later');
    return {
      ...item,
      topic: trendText(item.topic, 200, 'topic'),
      hook: trendText(item.hook, 500, 'hook'),
      whyNow: trendText(item.whyNow, 1000, 'why now'),
      fitReason: trendText(item.fitReason, 1000, 'fit reason'),
      freshnessScore: trendScore(item.freshnessScore, 'freshness score'),
      fitScore: trendScore(item.fitScore, 'fit score'),
      feasibilityScore: trendScore(item.feasibilityScore, 'feasibility score'),
      expiresAt: itemExpiresAt,
    };
  });
  return {
    ...input,
    periodStart,
    periodEnd,
    queryVersion: trendText(input.queryVersion, 120, 'query version'),
    providerKey: trendText(input.providerKey, 40, 'provider key'),
    completedAt,
    expiresAt,
    evidence,
    candidates,
  };
}
export class CreateCompletedTrendResearch {
  constructor(
    private readonly research: TrendResearchRepository,
    private readonly assignments: BunshinCapabilityAssignmentRepository,
  ) {}
  async execute(input: CreateCompletedTrendResearchInput) {
    const normalized = normalizeCompletedTrendResearchInput(input);
    await new RequireActiveBunshinCapability(this.assignments).execute({
      workspaceId: normalized.workspaceId,
      actorUserId: normalized.actorUserId,
      bunshinId: normalized.bunshinId,
      capabilityType: 'SOCIAL',
    });
    const value = await this.research.createCompleted(normalized);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'trend research scope not found');
    return value;
  }
}
export class ListActiveTrendIdeas {
  constructor(private readonly research: TrendResearchRepository) {}
  async execute(input: Parameters<TrendResearchRepository['listActive']>[0]) {
    trendTimestamp(input.at, 'at');
    const values = await this.research.listActive(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'trend research scope not found');
    return values;
  }
}

export interface RankTrendIdeaCandidatesInput {
  candidates: TrendIdeaCandidate[];
  platform: SocialPlatform;
  format: SocialPreferredFormat;
  availableMinutes: number;
  at: Date;
  maximum?: number;
}

export interface RankedTrendIdeaCandidate extends TrendIdeaCandidate {
  rankingScore: number;
}

export function rankTrendIdeaCandidates(
  input: RankTrendIdeaCandidatesInput,
): RankedTrendIdeaCandidate[] {
  trendTimestamp(input.at, 'ranking at');
  if (!Number.isInteger(input.availableMinutes) || input.availableMinutes < 1)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid ranking time budget');
  const maximum = input.maximum ?? 3;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 3)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid ranking candidate limit');
  assertPlatformFormat(input.platform, input.format);
  return input.candidates
    .filter(
      (candidate) =>
        candidate.platform === input.platform &&
        candidate.suggestedFormat === input.format &&
        candidate.safetyStatus === 'SAFE' &&
        candidate.expiresAt > input.at &&
        candidate.estimatedMinutes <= input.availableMinutes &&
        candidate.evidenceIds.length > 0,
    )
    .map((candidate) => ({
      ...candidate,
      rankingScore:
        candidate.fitScore * 40 + candidate.freshnessScore * 35 + candidate.feasibilityScore * 25,
    }))
    .sort(
      (left, right) =>
        right.rankingScore - left.rankingScore ||
        right.fitScore - left.fitScore ||
        left.id.localeCompare(right.id),
    )
    .slice(0, maximum);
}

export type TrendSearchFailureCategory =
  | 'AUTHENTICATION'
  | 'RATE_LIMIT'
  | 'QUOTA'
  | 'TIMEOUT_OR_NETWORK'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE';
export interface TrendSearchQuery {
  query: string;
  language: string;
  country: string;
  publishedAfter: Date;
  maximumResults: number;
}
export interface TrendSearchResultItem {
  url: string;
  title: string;
  publishedAt: Date | null;
  highlights: string[];
}
export interface TrendSearchResult {
  providerKey: string;
  items: TrendSearchResultItem[];
  creditsUsed: number | null;
  latencyMs: number;
}
export interface TrendResearchProviderPort {
  search(input: TrendSearchQuery): Promise<TrendSearchResult>;
}

export interface TrendProviderBenchmarkObservation {
  caseId: string;
  providerKey: string;
  query: TrendSearchQuery;
  result: TrendSearchResult | null;
  costUsdMicros: number;
  relevanceRating: number;
  sourceQualityRating: number;
  failed: boolean;
}
export interface TrendProviderBenchmarkScore {
  providerKey: string;
  totalCases: number;
  successfulCases: number;
  averageScore: number;
  averageCostUsdMicros: number;
  averageLatencyMs: number;
  metrics: {
    relevance: number;
    sourceQuality: number;
    coverage: number;
    freshness: number;
    reliability: number;
    costEfficiency: number;
  };
  eligibleForReview: boolean;
}
export interface TrendProviderBenchmarkReport {
  generatedAt: Date;
  scores: TrendProviderBenchmarkScore[];
  recommendation: string | null;
}

function benchmarkAverage(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
function benchmarkPercent(value: number) {
  return Math.round(Math.min(Math.max(value, 0), 100) * 100) / 100;
}
function benchmarkSafeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

export function evaluateTrendProviderBenchmark(
  observations: TrendProviderBenchmarkObservation[],
  expectedCaseIds: string[],
): TrendProviderBenchmarkReport {
  if (observations.length === 0) throw new Error('benchmark observations are required');
  const caseIds = new Set(expectedCaseIds.map((item) => item.trim()).filter(Boolean));
  if (caseIds.size === 0 || caseIds.size !== expectedCaseIds.length)
    throw new Error('unique benchmark case ids are required');
  const grouped = new Map<string, TrendProviderBenchmarkObservation[]>();
  for (const observation of observations) {
    if (!observation.caseId.trim() || !observation.providerKey.trim())
      throw new Error('benchmark identity is required');
    if (!caseIds.has(observation.caseId)) throw new Error('unknown benchmark case');
    if (!Number.isSafeInteger(observation.costUsdMicros) || observation.costUsdMicros < 0)
      throw new Error('benchmark cost must be a non-negative integer');
    if (
      !Number.isInteger(observation.relevanceRating) ||
      observation.relevanceRating < 0 ||
      observation.relevanceRating > 5 ||
      !Number.isInteger(observation.sourceQualityRating) ||
      observation.sourceQualityRating < 0 ||
      observation.sourceQualityRating > 5
    )
      throw new Error('benchmark ratings must be integers from 0 to 5');
    const values = grouped.get(observation.providerKey) ?? [];
    if (values.some((item) => item.caseId === observation.caseId))
      throw new Error('duplicate provider benchmark observation');
    values.push(observation);
    grouped.set(observation.providerKey, values);
  }
  const costs = observations.map((item) => item.costUsdMicros);
  const minimumCost = Math.min(...costs);
  const maximumCost = Math.max(...costs);
  const scores = [...grouped.entries()]
    .map(([providerKey, values]): TrendProviderBenchmarkScore => {
      const successful = values.filter((item) => !item.failed && item.result !== null);
      const relevance = benchmarkPercent(
        benchmarkAverage(values.map((item) => item.relevanceRating)) * 20,
      );
      const sourceQuality = benchmarkPercent(
        benchmarkAverage(values.map((item) => item.sourceQualityRating)) * 20,
      );
      const coverage = benchmarkPercent(
        benchmarkAverage(
          values.map((item) => {
            const valid = new Set(
              item.result?.items
                .filter((result) => benchmarkSafeUrl(result.url))
                .map((result) => result.url) ?? [],
            ).size;
            return (valid / Math.max(item.query.maximumResults, 1)) * 100;
          }),
        ),
      );
      const freshness = benchmarkPercent(
        benchmarkAverage(
          values.map((item) => {
            const dated = item.result?.items.filter((result) => result.publishedAt !== null) ?? [];
            if (dated.length === 0) return 0;
            return (
              (dated.filter((result) => result.publishedAt! >= item.query.publishedAfter).length /
                dated.length) *
              100
            );
          }),
        ),
      );
      const reliability = benchmarkPercent((successful.length / values.length) * 100);
      const averageCost = benchmarkAverage(values.map((item) => item.costUsdMicros));
      const costEfficiency = benchmarkPercent(
        maximumCost === minimumCost
          ? 100
          : ((maximumCost - averageCost) / (maximumCost - minimumCost)) * 100,
      );
      const averageScore = benchmarkPercent(
        relevance * 0.3 +
          sourceQuality * 0.25 +
          coverage * 0.15 +
          freshness * 0.15 +
          reliability * 0.1 +
          costEfficiency * 0.05,
      );
      return {
        providerKey,
        totalCases: values.length,
        successfulCases: successful.length,
        averageScore,
        averageCostUsdMicros: Math.round(averageCost),
        averageLatencyMs: Math.round(
          benchmarkAverage(values.map((item) => item.result?.latencyMs ?? 0)),
        ),
        metrics: { relevance, sourceQuality, coverage, freshness, reliability, costEfficiency },
        eligibleForReview:
          values.length === caseIds.size &&
          successful.length === values.length &&
          relevance >= 70 &&
          sourceQuality >= 70 &&
          coverage >= 60,
      };
    })
    .sort((left, right) => right.averageScore - left.averageScore);
  const eligible = scores.filter((item) => item.eligibleForReview);
  return {
    generatedAt: new Date(),
    scores,
    recommendation: eligible.length === 1 ? eligible[0]!.providerKey : null,
  };
}

export function formatTrendProviderBenchmarkMarkdown(report: TrendProviderBenchmarkReport) {
  const rows = report.scores.map(
    (score) =>
      `| ${score.providerKey} | ${score.averageScore.toFixed(2)} | ${score.successfulCases}/${score.totalCases} | ${score.metrics.relevance.toFixed(2)} | ${score.metrics.sourceQuality.toFixed(2)} | ${score.metrics.coverage.toFixed(2)} | ${score.metrics.freshness.toFixed(2)} | $${(score.averageCostUsdMicros / 1_000_000).toFixed(4)} | ${score.averageLatencyMs}ms | ${score.eligibleForReview ? '候補' : '要改善'} |`,
  );
  return [
    '# トレンド調査Provider比較結果',
    '',
    '| Provider | 総合点 | 成功 | 関連性 | 出典品質 | 根拠充足 | 鮮度確認 | 平均原価 | 平均時間 | 判定 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows,
    '',
    `単独推奨: ${report.recommendation ?? 'なし（人間レビューまたは追加比較が必要）'}`,
    '',
    '> この結果はProviderの自動有効化を行いません。関連性と出典品質は人間が0〜5で採点します。',
  ].join('\n');
}

export const GOLDEN_EVALUATION_OUTCOMES = ['ACCEPTED', 'REJECTED', 'FALLBACK'] as const;
export type GoldenEvaluationOutcome = (typeof GOLDEN_EVALUATION_OUTCOMES)[number];
export const GOLDEN_DATA_CLASSES = [
  'PUBLIC',
  'INTERNAL',
  'USER_PRIVATE',
  'RESTRICTED',
  'SECRET',
] as const;
export type GoldenDataClass = (typeof GOLDEN_DATA_CLASSES)[number];
export const GOLDEN_ALLOWED_TOOLS = [
  'TREND_EVIDENCE_READ',
  'BUNSHIN_CONTEXT_READ',
  'KNOWLEDGE_GRANT_READ',
  'CANDIDATE_SUBMIT',
] as const;
export type GoldenAllowedTool = (typeof GOLDEN_ALLOWED_TOOLS)[number];
export const GOLDEN_VIOLATION_CODES = [
  'OUTCOME_MISMATCH',
  'FAILURE_CATEGORY_MISMATCH',
  'FORBIDDEN_FRAGMENT',
  'DATA_POLICY_VIOLATION',
  'TOOL_POLICY_VIOLATION',
  'COST_LIMIT_EXCEEDED',
  'LATENCY_LIMIT_EXCEEDED',
  'RETRY_LIMIT_EXCEEDED',
  'RESULT_COUNT_EXCEEDED',
  'UNSAFE_URL',
] as const;
export type GoldenViolationCode = (typeof GOLDEN_VIOLATION_CODES)[number];

export interface GoldenDatasetCase {
  id: string;
  category: string;
  input: TrendSearchQuery;
  expectation: {
    outcome: GoldenEvaluationOutcome;
    failureCategory: TrendSearchFailureCategory | null;
    allowedDataClasses: GoldenDataClass[];
    allowedTools: GoldenAllowedTool[];
    forbiddenFragments: string[];
    maximumCostUsdMicros: number;
    maximumLatencyMs: number;
    maximumRetries: number;
  };
}
export interface GoldenDataset {
  version: string;
  cases: GoldenDatasetCase[];
}
export interface GoldenEvaluationObservation {
  outcome: GoldenEvaluationOutcome;
  failureCategory: TrendSearchFailureCategory | null;
  result: TrendSearchResult | null;
  emittedText: string[];
  accessedDataClasses: GoldenDataClass[];
  attemptedTools: string[];
  costUsdMicros: number;
  latencyMs: number;
  retryCount: number;
}
export interface GoldenEvaluationReport {
  caseId: string;
  passed: boolean;
  violations: GoldenViolationCode[];
}
export const GOLDEN_RUN_CONFIGURATION_ERROR_CODES = [
  'MISSING_OBSERVATION',
  'DUPLICATE_OBSERVATION',
  'UNKNOWN_CASE',
] as const;
export type GoldenRunConfigurationErrorCode = (typeof GOLDEN_RUN_CONFIGURATION_ERROR_CODES)[number];
export interface GoldenDatasetObservation {
  caseId: string;
  observation: GoldenEvaluationObservation;
}
export interface GoldenDatasetRunReport {
  datasetVersion: string;
  passed: boolean;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  reports: GoldenEvaluationReport[];
  configurationErrors: Array<{ code: GoldenRunConfigurationErrorCode; caseId: string }>;
}

function goldenUnique<T>(values: T[]) {
  return [...new Set(values)];
}
function goldenHasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return expected.length === actual.length && expected.every((key, index) => key === actual[index]);
}
function goldenSafeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}
export function evaluateGoldenDatasetCase(
  testCase: GoldenDatasetCase,
  observation: GoldenEvaluationObservation,
): GoldenEvaluationReport {
  const violations: GoldenViolationCode[] = [];
  const expected = testCase.expectation;
  if (observation.outcome !== expected.outcome) violations.push('OUTCOME_MISMATCH');
  if (observation.failureCategory !== expected.failureCategory)
    violations.push('FAILURE_CATEGORY_MISMATCH');
  const resultText =
    observation.result?.items.flatMap((item) => [item.title, ...item.highlights]) ?? [];
  const text = [...observation.emittedText, ...resultText].join('\n').toLocaleLowerCase('ja-JP');
  if (
    expected.forbiddenFragments.some((fragment) =>
      text.includes(fragment.toLocaleLowerCase('ja-JP')),
    )
  )
    violations.push('FORBIDDEN_FRAGMENT');
  if (
    observation.accessedDataClasses.some(
      (dataClass) => !expected.allowedDataClasses.includes(dataClass),
    )
  )
    violations.push('DATA_POLICY_VIOLATION');
  if (
    observation.attemptedTools.some(
      (tool) => !expected.allowedTools.includes(tool as GoldenAllowedTool),
    )
  )
    violations.push('TOOL_POLICY_VIOLATION');
  if (observation.costUsdMicros > expected.maximumCostUsdMicros)
    violations.push('COST_LIMIT_EXCEEDED');
  if (observation.latencyMs > expected.maximumLatencyMs) violations.push('LATENCY_LIMIT_EXCEEDED');
  if (observation.retryCount > expected.maximumRetries) violations.push('RETRY_LIMIT_EXCEEDED');
  if (observation.result && observation.result.items.length > testCase.input.maximumResults)
    violations.push('RESULT_COUNT_EXCEEDED');
  if (observation.result?.items.some((item) => !goldenSafeUrl(item.url)))
    violations.push('UNSAFE_URL');
  const unique = goldenUnique(violations);
  return { caseId: testCase.id, passed: unique.length === 0, violations: unique };
}

export function runGoldenDatasetRegression(
  dataset: GoldenDataset,
  observations: GoldenDatasetObservation[],
): GoldenDatasetRunReport {
  const knownIds = new Set(dataset.cases.map((item) => item.id));
  const grouped = new Map<string, GoldenEvaluationObservation[]>();
  for (const item of observations) {
    const values = grouped.get(item.caseId) ?? [];
    values.push(item.observation);
    grouped.set(item.caseId, values);
  }
  const configurationErrors: GoldenDatasetRunReport['configurationErrors'] = [];
  for (const caseId of grouped.keys()) {
    if (!knownIds.has(caseId)) configurationErrors.push({ code: 'UNKNOWN_CASE', caseId });
  }
  const reports: GoldenEvaluationReport[] = [];
  for (const testCase of dataset.cases) {
    const values = grouped.get(testCase.id) ?? [];
    if (values.length === 0) {
      configurationErrors.push({ code: 'MISSING_OBSERVATION', caseId: testCase.id });
      continue;
    }
    if (values.length > 1) {
      configurationErrors.push({ code: 'DUPLICATE_OBSERVATION', caseId: testCase.id });
      continue;
    }
    const observation = values[0];
    if (observation) reports.push(evaluateGoldenDatasetCase(testCase, observation));
  }
  const passedCases = reports.filter((item) => item.passed).length;
  const failedCases = dataset.cases.length - passedCases;
  return {
    datasetVersion: dataset.version,
    passed: configurationErrors.length === 0 && failedCases === 0,
    totalCases: dataset.cases.length,
    passedCases,
    failedCases,
    reports,
    configurationErrors,
  };
}

export function parseGoldenDataset(value: unknown): GoldenDataset {
  if (!value || typeof value !== 'object') throw new Error('golden dataset must be an object');
  const candidate = value as { version?: unknown; cases?: unknown };
  if (!goldenHasExactKeys(value as Record<string, unknown>, ['version', 'cases']))
    throw new Error('golden dataset has unknown fields');
  if (typeof candidate.version !== 'string' || candidate.version.trim().length === 0)
    throw new Error('golden dataset version is required');
  if (!Array.isArray(candidate.cases) || candidate.cases.length === 0)
    throw new Error('golden dataset cases are required');
  const cases = candidate.cases.map((entry, index): GoldenDatasetCase => {
    if (!entry || typeof entry !== 'object') throw new Error(`golden case ${index} is invalid`);
    const row = entry as Record<string, unknown>;
    const input = row['input'] as Record<string, unknown> | undefined;
    const expectation = row['expectation'] as Record<string, unknown> | undefined;
    if (
      typeof row['id'] !== 'string' ||
      typeof row['category'] !== 'string' ||
      !input ||
      !expectation
    )
      throw new Error(`golden case ${index} identity is invalid`);
    if (!goldenHasExactKeys(row, ['id', 'category', 'input', 'expectation']))
      throw new Error(`golden case ${row['id']} has unknown fields`);
    if (
      !goldenHasExactKeys(input, [
        'query',
        'language',
        'country',
        'publishedAfter',
        'maximumResults',
      ])
    )
      throw new Error(`golden case ${row['id']} input has unknown fields`);
    if (
      !goldenHasExactKeys(expectation, [
        'outcome',
        'failureCategory',
        'allowedDataClasses',
        'allowedTools',
        'forbiddenFragments',
        'maximumCostUsdMicros',
        'maximumLatencyMs',
        'maximumRetries',
      ])
    )
      throw new Error(`golden case ${row['id']} expectation has unknown fields`);
    const publishedAfter = new Date(String(input['publishedAfter']));
    const maximumResults = input['maximumResults'];
    if (
      typeof input['query'] !== 'string' ||
      typeof input['language'] !== 'string' ||
      typeof input['country'] !== 'string' ||
      Number.isNaN(publishedAfter.valueOf()) ||
      typeof maximumResults !== 'number' ||
      !Number.isInteger(maximumResults) ||
      maximumResults < 1 ||
      maximumResults > 10
    )
      throw new Error(`golden case ${row['id']} input is invalid`);
    const outcome = expectation['outcome'];
    const failureCategory = expectation['failureCategory'];
    const allowedDataClasses = expectation['allowedDataClasses'];
    const allowedTools = expectation['allowedTools'];
    const forbiddenFragments = expectation['forbiddenFragments'];
    if (
      !GOLDEN_EVALUATION_OUTCOMES.includes(outcome as GoldenEvaluationOutcome) ||
      !(
        failureCategory === null ||
        (typeof failureCategory === 'string' &&
          [
            'AUTHENTICATION',
            'RATE_LIMIT',
            'QUOTA',
            'TIMEOUT_OR_NETWORK',
            'PROVIDER_ERROR',
            'INVALID_RESPONSE',
          ].includes(failureCategory))
      ) ||
      !Array.isArray(allowedDataClasses) ||
      !allowedDataClasses.every((item) => GOLDEN_DATA_CLASSES.includes(item as GoldenDataClass)) ||
      !Array.isArray(allowedTools) ||
      !allowedTools.every((item) => GOLDEN_ALLOWED_TOOLS.includes(item as GoldenAllowedTool)) ||
      !Array.isArray(forbiddenFragments) ||
      !forbiddenFragments.every((item) => typeof item === 'string')
    )
      throw new Error(`golden case ${row['id']} expectation is invalid`);
    for (const field of ['maximumCostUsdMicros', 'maximumLatencyMs', 'maximumRetries'] as const) {
      if (typeof expectation[field] !== 'number' || expectation[field] < 0)
        throw new Error(`golden case ${row['id']} ${field} is invalid`);
    }
    return {
      id: row['id'],
      category: row['category'],
      input: {
        query: input['query'],
        language: input['language'],
        country: input['country'],
        publishedAfter,
        maximumResults,
      },
      expectation: {
        outcome: outcome as GoldenEvaluationOutcome,
        failureCategory: failureCategory as TrendSearchFailureCategory | null,
        allowedDataClasses: allowedDataClasses as GoldenDataClass[],
        allowedTools: allowedTools as GoldenAllowedTool[],
        forbiddenFragments,
        maximumCostUsdMicros: expectation['maximumCostUsdMicros'] as number,
        maximumLatencyMs: expectation['maximumLatencyMs'] as number,
        maximumRetries: expectation['maximumRetries'] as number,
      },
    };
  });
  if (new Set(cases.map((item) => item.id)).size !== cases.length)
    throw new Error('golden dataset case ids must be unique');
  return { version: candidate.version.trim(), cases };
}
