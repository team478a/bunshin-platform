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
