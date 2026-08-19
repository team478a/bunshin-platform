import {
  RequireActiveBunshinCapability,
  type BunshinCapabilityAssignmentRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export const SOCIAL_PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'X', 'OTHER'] as const;
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
  'SLIDE',
  'LIVE_ACTION',
  'AI_VIDEO_PROMPT',
  'IMAGE',
] as const;
export type SocialPreferredFormat = (typeof SOCIAL_PREFERRED_FORMATS)[number];

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
  status: SocialProfileStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSocialProfileInput {
  workspaceId: string;
  actorUserId: string;
  bunshinId: string;
  platform: SocialPlatform;
  handle?: string | null;
  profileUrl?: string | null;
  purpose: string;
  postingFrequency: SocialPostingFrequency;
  preferredFormats: SocialPreferredFormat[];
}

export interface UpdateSocialProfileInput {
  workspaceId: string;
  actorUserId: string;
  bunshinId: string;
  platform: SocialPlatform;
  handle?: string | null;
  profileUrl?: string | null;
  purpose?: string;
  postingFrequency?: SocialPostingFrequency;
  preferredFormats?: SocialPreferredFormat[];
}

export interface SocialProfileRepository {
  create(input: CreateSocialProfileInput): Promise<SocialProfile | null>;
  list(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
  }): Promise<SocialProfile[] | null>;
  findByPlatform(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    platform: SocialPlatform;
  }): Promise<SocialProfile | null>;
  update(input: UpdateSocialProfileInput): Promise<SocialProfile | null>;
  setActive(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    platform: SocialPlatform;
    active: boolean;
  }): Promise<SocialProfile | null>;
}

const isOneOf = <T extends string>(value: string, values: readonly T[]): value is T =>
  values.some((candidate) => candidate === value);

export function parsePreferredFormats(value: unknown): SocialPreferredFormat[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    throw new ApplicationError('VALIDATION_ERROR', 'preferredFormats must contain 1 to 4 values');
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
  ];
  if (mutable.every((value) => value === undefined)) {
    throw new ApplicationError('VALIDATION_ERROR', 'at least one update field is required');
  }
  return {
    workspaceId: input.workspaceId,
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
  };
}

abstract class SocialProfileMutation {
  constructor(
    protected readonly profiles: SocialProfileRepository,
    private readonly assignments: BunshinCapabilityAssignmentRepository,
  ) {}

  protected async requireActive(input: {
    workspaceId: string;
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
  async execute(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    const values = await this.profiles.list(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return values;
  }
}

export class GetSocialProfile {
  constructor(private readonly profiles: SocialProfileRepository) {}
  async execute(input: {
    workspaceId: string;
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
  actorUserId: string;
  bunshinId: string;
  title: string;
  description?: string | null;
  weight: number;
}

export interface UpdateContentPillarInput {
  workspaceId: string;
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
    actorUserId: string;
    bunshinId: string;
  }): Promise<ContentPillar[] | null>;
  find(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
  }): Promise<ContentPillar | null>;
  update(input: UpdateContentPillarInput): Promise<ContentPillar | null>;
  setActive(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
    active: boolean;
  }): Promise<ContentPillar | null>;
  softDelete(input: {
    workspaceId: string;
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
  async execute(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    const values = await this.pillars.list(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return values;
  }
}

export class GetContentPillar {
  constructor(private readonly pillars: ContentPillarRepository) {}
  async execute(input: {
    workspaceId: string;
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
