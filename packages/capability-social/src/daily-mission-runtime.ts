import {
  validateGenerationContextSnapshot,
  type CampaignContentClassification,
  type GenerationContextSnapshotPayload,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

import { DailyMissionMutation } from './daily-mission-authorization';
import {
  missionInteger,
  missionString,
  normalizeMissionContent,
  type MissionContent,
} from './mission-content';
import {
  DEFAULT_CONTENT_ASSISTANCE_LEVEL,
  parseContentAssistanceLevel,
  type ContentAssistanceLevel,
  type SocialPlatform,
  type SocialPreferredFormat,
} from './social-profile';
import { validateEnum } from './social-validation';
import type { TrendEvidenceSourceType } from './trend-research';
import { localDate, weeklyFormat } from './weekly-plan-validation';
export const DAILY_MISSION_STATUSES = [
  'GENERATED',
  'VIEWED',
  'STARTED',
  'COMPLETED',
  'SKIPPED',
  'EXPIRED',
] as const;
export type DailyMissionStatus = (typeof DAILY_MISSION_STATUSES)[number];
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

export const MISSION_CONTENT_VARIANT_GENERATION_STATUSES = [
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
] as const;
export type MissionContentVariantGenerationStatus =
  (typeof MISSION_CONTENT_VARIANT_GENERATION_STATUSES)[number];

export interface MissionContentVariant {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  sequence: number;
  format: SocialPreferredFormat;
  content: MissionContent;
  qualityScore: number;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicros: bigint | null;
  latencyMs: number;
  createdAt: Date;
  selectedAt: Date | null;
}

export interface MissionContentVariantGeneration {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  idempotencyKey: string;
  status: MissionContentVariantGenerationStatus;
  variantId: string | null;
  errorCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MissionContentVariantRepository {
  claim(
    input: DailyMissionScope & { dailyMissionId: string; idempotencyKey: string },
  ): Promise<{ acquired: boolean; generation: MissionContentVariantGeneration } | null>;
  complete(
    input: DailyMissionScope & {
      dailyMissionId: string;
      generationId: string;
      format: SocialPreferredFormat;
      content: MissionContent;
      qualityScore: number;
      model: string;
      promptVersion: string;
      inputTokens: number | null;
      outputTokens: number | null;
      estimatedCostMicros: bigint | null;
      latencyMs: number;
    },
  ): Promise<MissionContentVariant | null>;
  fail(
    input: DailyMissionScope & {
      dailyMissionId: string;
      generationId: string;
      errorCategory: string;
      model?: string;
      promptVersion?: string;
      inputTokens?: number | null;
      outputTokens?: number | null;
      estimatedCostMicros?: bigint | null;
      latencyMs?: number;
    },
  ): Promise<boolean | null>;
  list(
    input: DailyMissionScope & { dailyMissionId: string },
  ): Promise<MissionContentVariant[] | null>;
  select(
    input: DailyMissionScope & {
      dailyMissionId: string;
      variantId: string;
      idempotencyKey: string;
      selectedAt: Date;
    },
  ): Promise<MissionContentVariant | null>;
}

function variantIdempotencyKey(value: string) {
  if (value.trim().length < 1 || value.length > 200)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid idempotency key');
  return value;
}

export class ClaimMissionContentVariantGeneration {
  constructor(private readonly repository: MissionContentVariantRepository) {}

  async execute(input: DailyMissionScope & { dailyMissionId: string; idempotencyKey: string }) {
    const result = await this.repository.claim({
      ...input,
      idempotencyKey: variantIdempotencyKey(input.idempotencyKey),
    });
    if (!result) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return result;
  }
}

export class CompleteMissionContentVariantGeneration {
  constructor(private readonly repository: MissionContentVariantRepository) {}

  async execute(input: Parameters<MissionContentVariantRepository['complete']>[0]) {
    const nullableCount = (value: number | null, field: string) =>
      value === null ? null : missionInteger(value, 0, 2_000_000_000, field);
    if (input.estimatedCostMicros !== null && input.estimatedCostMicros < 0n)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid estimated cost');
    const variant = await this.repository.complete({
      ...input,
      content: normalizeMissionContent(input.format, input.content),
      qualityScore: missionInteger(input.qualityScore, 0, 100, 'quality score'),
      model: missionString(input.model, 120, 'model'),
      promptVersion: missionString(input.promptVersion, 120, 'prompt version'),
      inputTokens: nullableCount(input.inputTokens, 'input tokens'),
      outputTokens: nullableCount(input.outputTokens, 'output tokens'),
      latencyMs: missionInteger(input.latencyMs, 0, 2_000_000_000, 'latency'),
    });
    if (!variant) throw new ApplicationError('NOT_FOUND', 'variant generation not found');
    return variant;
  }
}

export class FailMissionContentVariantGeneration {
  constructor(private readonly repository: MissionContentVariantRepository) {}

  async execute(input: Parameters<MissionContentVariantRepository['fail']>[0]) {
    const failed = await this.repository.fail({
      ...input,
      errorCategory: missionString(input.errorCategory, 80, 'error category'),
      ...(input.model === undefined ? {} : { model: missionString(input.model, 120, 'model') }),
      ...(input.promptVersion === undefined
        ? {}
        : { promptVersion: missionString(input.promptVersion, 120, 'prompt version') }),
      ...(input.inputTokens === undefined || input.inputTokens === null
        ? {}
        : { inputTokens: missionInteger(input.inputTokens, 0, 2_000_000_000, 'input tokens') }),
      ...(input.outputTokens === undefined || input.outputTokens === null
        ? {}
        : {
            outputTokens: missionInteger(input.outputTokens, 0, 2_000_000_000, 'output tokens'),
          }),
      ...(input.latencyMs === undefined
        ? {}
        : { latencyMs: missionInteger(input.latencyMs, 0, 2_000_000_000, 'latency') }),
    });
    if (failed === null) throw new ApplicationError('NOT_FOUND', 'variant generation not found');
    return failed;
  }
}

export class ListMissionContentVariants {
  constructor(private readonly repository: MissionContentVariantRepository) {}

  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const variants = await this.repository.list(input);
    if (!variants) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return variants;
  }
}

export class SelectMissionContentVariant {
  constructor(private readonly repository: MissionContentVariantRepository) {}

  async execute(input: Parameters<MissionContentVariantRepository['select']>[0]) {
    const variant = await this.repository.select({
      ...input,
      idempotencyKey: variantIdempotencyKey(input.idempotencyKey),
    });
    if (!variant) throw new ApplicationError('NOT_FOUND', 'mission content variant not found');
    return variant;
  }
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
