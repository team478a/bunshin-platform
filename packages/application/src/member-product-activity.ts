import { ApplicationError } from '@bunshin/shared';
import {
  MEMBER_PRODUCT_CONTENT_PLATFORMS,
  type MemberProductContentPlatform,
} from './member-product-content';

export const MEMBER_PRODUCT_CONTENT_EVENT_TYPES = ['COPIED', 'POSTED'] as const;
export type MemberProductContentEventType = (typeof MEMBER_PRODUCT_CONTENT_EVENT_TYPES)[number];

export interface MemberProductActivitySummary {
  profileId: string;
  productName: string;
  productPackName: string | null;
  generatedCount: number;
  copiedCount: number;
  postedCount: number;
  trackingUrlUsedCount: number;
  lastActivityAt: Date | null;
}

export interface MemberProductServiceActivitySummary {
  key: string;
  productName: string;
  generatedCount: number;
  copiedCount: number;
  postedCount: number;
  trackingUrlUsedCount: number;
  memberCount: number;
  lastActivityAt: Date;
}

export interface MemberProductActivityRepository {
  recordGeneration(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    profileId: string;
    bunshinId: string;
    externalTrackingLinkId: string;
    productPackId: string | null;
    platform: MemberProductContentPlatform;
    candidateCount: number;
    operationKey: string;
    occurredAt: Date;
  }): Promise<{ id: string; createdAt: Date } | null>;
  recordEvent(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    contentRunId: string;
    type: MemberProductContentEventType;
    candidateIndex: number;
    operationKey: string;
    occurredAt: Date;
  }): Promise<{ recorded: boolean } | null>;
  listMemberSummary(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<MemberProductActivitySummary[] | null>;
  listServiceSummary(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<MemberProductServiceActivitySummary[] | null>;
}

export class MemberProductActivityService {
  constructor(private readonly repository: MemberProductActivityRepository) {}

  async recordGeneration(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    profileId: string;
    bunshinId: string;
    externalTrackingLinkId: string;
    productPackId: string | null;
    platform: MemberProductContentPlatform;
    candidateCount: number;
    operationKey: string;
  }) {
    if (!MEMBER_PRODUCT_CONTENT_PLATFORMS.includes(input.platform))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid member product platform');
    if (
      !Number.isInteger(input.candidateCount) ||
      input.candidateCount < 1 ||
      input.candidateCount > 10
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid candidate count');
    const value = await this.repository.recordGeneration({
      ...input,
      profileId: requiredIdentifier(input.profileId, 'member product profile id'),
      bunshinId: requiredIdentifier(input.bunshinId, 'bunshin id'),
      externalTrackingLinkId: requiredIdentifier(
        input.externalTrackingLinkId,
        'external tracking link id',
      ),
      productPackId: input.productPackId
        ? requiredIdentifier(input.productPackId, 'product pack id')
        : null,
      operationKey: requiredOperationKey(input.operationKey),
      occurredAt: new Date(),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'member product generation unavailable');
    return value;
  }

  async recordEvent(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    contentRunId: string;
    type: MemberProductContentEventType;
    candidateIndex: number;
    operationKey: string;
  }) {
    if (!MEMBER_PRODUCT_CONTENT_EVENT_TYPES.includes(input.type))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid member product activity type');
    if (
      !Number.isInteger(input.candidateIndex) ||
      input.candidateIndex < 0 ||
      input.candidateIndex > 9
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid candidate index');
    const value = await this.repository.recordEvent({
      ...input,
      contentRunId: requiredIdentifier(input.contentRunId, 'member product content run id'),
      operationKey: requiredOperationKey(input.operationKey),
      occurredAt: new Date(),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'member product content run unavailable');
    return value;
  }

  async listMemberSummary(input: { workspaceId: string; groupId: string; actorUserId: string }) {
    const value = await this.repository.listMemberSummary(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'service membership unavailable');
    return value;
  }

  async listServiceSummary(input: { workspaceId: string; groupId: string; actorUserId: string }) {
    const value = await this.repository.listServiceSummary(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'service management unavailable');
    return value;
  }
}

function requiredIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 100)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${label}`);
  return normalized;
}

function requiredOperationKey(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid operation key');
  return normalized;
}
