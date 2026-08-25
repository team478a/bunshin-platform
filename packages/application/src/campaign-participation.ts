import { ApplicationError } from '@bunshin/shared';

export type CampaignStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';
export type CampaignDecision = 'ACCEPTED' | 'DECLINED' | 'ON_HOLD' | 'WITHDRAWN';

export interface CampaignAdminScope {
  workspaceId: string;
  actorUserId: string;
}

export interface CampaignParticipantScope {
  workspaceId: string;
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
    const assetIds = [...new Set(input.assetIds ?? [])];
    const result = await this.repository.createDraft({
      ...input,
      name: text(input.name, 'name', 160),
      theme: text(input.theme, 'theme', 1000),
      targetSummary: text(input.targetSummary, 'targetSummary', 1000),
      assetIds,
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
}
