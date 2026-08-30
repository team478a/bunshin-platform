import { ApplicationError } from '@bunshin/shared';

export type CampaignStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';
export type CampaignDecision = 'ACCEPTED' | 'DECLINED' | 'ON_HOLD' | 'WITHDRAWN';
export type CampaignContentClassification = 'ORGANIC' | 'PRODUCT_RELATED' | 'ADVERTISEMENT';

export interface CampaignPlanningContext {
  id: string;
  name: string;
  theme: string;
  targetSummary: string;
  startsAt: Date;
  endsAt: Date;
  maxRelatedPerWeek: number;
  maxAdsPerWeek: number;
  cooldownDays: number;
  productPack: {
    productPackId: string;
    groupId: string;
    versionId: string;
    version: number;
    allowLinklessPosts: boolean;
    summary: string;
    providerName: string;
    targetCustomer: string;
    facts: Record<string, string>;
    rules: Array<{ type: string; value: string; condition: string | null }>;
    assets: Array<{ type: string; url: string; label: string; usageTerms: string }>;
  };
}

export interface CampaignAdminScope {
  workspaceId: string;
  actorUserId: string;
  groupId?: string;
}

export interface CampaignParticipantScope {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
}

export interface CampaignRepository {
  listManaged(input: CampaignAdminScope): Promise<object[] | null>;
  createDraft(
    input: CampaignAdminScope & {
      groupId: string;
      productPackVersionId: string;
      name: string;
      theme: string;
      targetSummary: string;
      participationLimit: number;
      maxRelatedPerWeek: number;
      maxAdsPerWeek: number;
      cooldownDays: number;
      generationLimitPerParticipant: number;
      similarityThresholdBasisPoints: number;
      startsAt: Date;
      endsAt: Date;
      assetIds: string[];
      now: Date;
    },
  ): Promise<object | null>;
  transition(
    input: CampaignAdminScope & {
      campaignId: string;
      from: CampaignStatus;
      to: Exclude<CampaignStatus, 'DRAFT'>;
      now: Date;
      reason: string | null;
    },
  ): Promise<object | null>;
  listAvailable(input: CampaignParticipantScope & { now: Date }): Promise<object[] | null>;
  decide(
    input: CampaignParticipantScope & {
      campaignId: string;
      decision: CampaignDecision;
      now: Date;
      reason: string | null;
    },
  ): Promise<object | null>;
  listPlanningContexts(
    input: CampaignParticipantScope & { from: Date; to: Date },
  ): Promise<CampaignPlanningContext[] | null>;
  resolvePlanningContext(
    input: CampaignParticipantScope & { campaignId: string; at: Date },
  ): Promise<CampaignPlanningContext | null>;
}

const text = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class CampaignService {
  constructor(private readonly repository: CampaignRepository) {}

  async listManaged(input: CampaignAdminScope) {
    const result = await this.repository.listManaged(input);
    if (result === null) throw new ApplicationError('FORBIDDEN', 'campaign management denied');
    return result;
  }

  async createDraft(
    input: CampaignAdminScope & {
      groupId: string;
      productPackVersionId: string;
      name: string;
      theme: string;
      targetSummary: string;
      participationLimit: number;
      maxRelatedPerWeek?: number;
      maxAdsPerWeek?: number;
      cooldownDays?: number;
      generationLimitPerParticipant?: number;
      similarityThresholdBasisPoints?: number;
      startsAt: Date;
      endsAt: Date;
      assetIds?: string[];
    },
  ) {
    if (
      !Number.isInteger(input.participationLimit) ||
      input.participationLimit < 1 ||
      input.participationLimit > 10000
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid participationLimit');
    if (input.startsAt >= input.endsAt)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid campaign period');
    const maxRelatedPerWeek = input.maxRelatedPerWeek ?? 2;
    const maxAdsPerWeek = input.maxAdsPerWeek ?? 1;
    const cooldownDays = input.cooldownDays ?? 2;
    const generationLimitPerParticipant = input.generationLimitPerParticipant ?? 60;
    const similarityThresholdBasisPoints = input.similarityThresholdBasisPoints ?? 8500;
    if (
      !Number.isInteger(maxRelatedPerWeek) ||
      maxRelatedPerWeek < 0 ||
      maxRelatedPerWeek > 7 ||
      !Number.isInteger(maxAdsPerWeek) ||
      maxAdsPerWeek < 0 ||
      maxAdsPerWeek > maxRelatedPerWeek ||
      !Number.isInteger(cooldownDays) ||
      cooldownDays < 0 ||
      cooldownDays > 30 ||
      !Number.isInteger(generationLimitPerParticipant) ||
      generationLimitPerParticipant < 1 ||
      generationLimitPerParticipant > 365 ||
      !Number.isInteger(similarityThresholdBasisPoints) ||
      similarityThresholdBasisPoints < 7000 ||
      similarityThresholdBasisPoints > 10000
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid campaign planning policy');
    const assetIds = [...new Set(input.assetIds ?? [])];
    const result = await this.repository.createDraft({
      ...input,
      name: text(input.name, 'name', 160),
      theme: text(input.theme, 'theme', 1000),
      targetSummary: text(input.targetSummary, 'targetSummary', 1000),
      assetIds,
      maxRelatedPerWeek,
      maxAdsPerWeek,
      cooldownDays,
      generationLimitPerParticipant,
      similarityThresholdBasisPoints,
      now: new Date(),
    });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'campaign context unavailable');
    return result;
  }

  async transition(
    input: CampaignAdminScope & {
      campaignId: string;
      from: CampaignStatus;
      to: 'OPEN' | 'CLOSED' | 'CANCELLED';
      reason?: string | null;
    },
  ) {
    const allowed =
      (input.from === 'DRAFT' && input.to === 'OPEN') ||
      (input.from === 'OPEN' && (input.to === 'CLOSED' || input.to === 'CANCELLED'));
    if (!allowed) throw new ApplicationError('CONFLICT', 'invalid campaign transition');
    const result = await this.repository.transition({
      ...input,
      reason: input.reason?.trim().slice(0, 500) || null,
      now: new Date(),
    });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'campaign unavailable');
    return result;
  }

  async listAvailable(input: CampaignParticipantScope) {
    const result = await this.repository.listAvailable({ ...input, now: new Date() });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'participant scope unavailable');
    return result;
  }

  async decide(
    input: CampaignParticipantScope & {
      campaignId: string;
      decision: CampaignDecision;
      reason?: string | null;
    },
  ) {
    const result = await this.repository.decide({
      ...input,
      reason: input.reason?.trim().slice(0, 500) || null,
      now: new Date(),
    });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'campaign unavailable');
    return result;
  }

  async listPlanningContexts(input: CampaignParticipantScope & { from: Date; to: Date }) {
    if (input.from > input.to)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid campaign planning period');
    const result = await this.repository.listPlanningContexts(input);
    if (result === null) throw new ApplicationError('NOT_FOUND', 'participant scope unavailable');
    return result;
  }

  async resolvePlanningContext(
    input: CampaignParticipantScope & { campaignId: string; at?: Date },
  ) {
    const result = await this.repository.resolvePlanningContext({
      ...input,
      at: input.at ?? new Date(),
    });
    if (result === null)
      throw new ApplicationError('NOT_FOUND', 'campaign planning context unavailable');
    return result;
  }
}
