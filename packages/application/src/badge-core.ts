import { ApplicationError } from '@bunshin/shared';

export const BADGE_OWNER_TYPES = ['SYSTEM', 'GROUP'] as const;
export type BadgeOwnerType = (typeof BADGE_OWNER_TYPES)[number];
export const BADGE_CONDITION_TYPES = [
  'FIRST',
  'COUNT',
  'STREAK_DAILY',
  'STREAK_WEEKLY',
  'WINDOW',
  'COMPOSITE',
  'DISTINCT',
  'MANUAL_APPROVAL',
  'IMPORT',
] as const;
export type BadgeConditionType = (typeof BADGE_CONDITION_TYPES)[number];
export type BadgeVisibilityPolicy = 'PRIVATE' | 'GROUP';
export type BadgeProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'ELIGIBLE' | 'AWARDED';
export type BadgeAwardStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';
export type BadgeProcessingStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface BadgeDefinitionRecord {
  id: string;
  ownerType: BadgeOwnerType;
  workspaceId: string | null;
  groupId: string | null;
  code: string;
  category: string;
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'SUSPENDED';
  currentVersion: number;
}

export interface BadgeVersionRecord {
  id: string;
  definitionId: string;
  version: number;
  title: string;
  description: string;
  imageKey: string;
  lockedImageKey: string | null;
  altText: string;
  backgroundColor: string | null;
  conditionType: BadgeConditionType;
  conditionConfig: Record<string, unknown>;
  visibilityPolicy: BadgeVisibilityPolicy;
  rewardPolicy: Record<string, unknown>;
  startsAt: Date | null;
  endsAt: Date | null;
  publishedAt: Date | null;
}

export interface BadgeProgressRecord {
  id: string;
  workspaceId: string;
  userId: string;
  badgeVersionId: string;
  groupId: string | null;
  currentValue: number;
  targetValue: number;
  streakState: Record<string, unknown> | null;
  status: BadgeProgressStatus;
  lastEventAt: Date | null;
  revision: number;
}

export interface BadgeAwardRecord {
  id: string;
  workspaceId: string;
  userId: string;
  badgeVersionId: string;
  groupId: string | null;
  sourceBunshinId: string | null;
  awardedAt: Date;
  sourceType: string;
  sourceId: string;
  evidenceHash: string;
  idempotencyKey: string;
  status: BadgeAwardStatus;
}

export interface BadgeProcessingEventRecord {
  id: string;
  workspaceId: string;
  userId: string;
  eventType: string;
  sourceEventId: string;
  status: BadgeProcessingStatus;
  failureCode: string | null;
  processedAt: Date | null;
}

export interface BadgeCoreRepository {
  createDefinition(input: {
    actorUserId: string;
    ownerType: BadgeOwnerType;
    workspaceId: string | null;
    groupId: string | null;
    code: string;
    category: string;
    reason: string;
  }): Promise<BadgeDefinitionRecord | null>;
  createVersion(input: {
    actorUserId: string;
    definitionId: string;
    title: string;
    description: string;
    imageKey: string;
    lockedImageKey: string | null;
    altText: string;
    backgroundColor: string | null;
    conditionType: BadgeConditionType;
    conditionConfig: Record<string, unknown>;
    visibilityPolicy: BadgeVisibilityPolicy;
    rewardPolicy: Record<string, unknown>;
    startsAt: Date | null;
    endsAt: Date | null;
    reason: string;
  }): Promise<BadgeVersionRecord | null>;
  publishVersion(input: {
    actorUserId: string;
    definitionId: string;
    badgeVersionId: string;
    publishedAt: Date;
    reason: string;
  }): Promise<BadgeVersionRecord | null>;
  saveProgress(input: {
    workspaceId: string;
    userId: string;
    badgeVersionId: string;
    groupId: string | null;
    currentValue: number;
    targetValue: number;
    streakState: Record<string, unknown> | null;
    status: BadgeProgressStatus;
    lastEventAt: Date | null;
  }): Promise<BadgeProgressRecord | null>;
  award(input: {
    workspaceId: string;
    userId: string;
    badgeVersionId: string;
    groupId: string | null;
    sourceBunshinId: string | null;
    awardedAt: Date;
    sourceType: string;
    sourceId: string;
    evidenceHash: string;
    idempotencyKey: string;
  }): Promise<BadgeAwardRecord | null>;
  recordProcessingEvent(input: {
    workspaceId: string;
    userId: string;
    eventType: string;
    sourceEventId: string;
    status: BadgeProcessingStatus;
    failureCode: string | null;
    processedAt: Date | null;
  }): Promise<BadgeProcessingEventRecord | null>;
}

const required = (value: string, field: string, max = 200) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};
const nonnegative = (value: number, field: string) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
};

export class CreateBadgeDefinition {
  constructor(private readonly repository: BadgeCoreRepository) {}
  async execute(input: Parameters<BadgeCoreRepository['createDefinition']>[0]) {
    if (
      (input.ownerType === 'SYSTEM' && (input.workspaceId !== null || input.groupId !== null)) ||
      (input.ownerType === 'GROUP' && (!input.workspaceId || !input.groupId))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge owner scope');
    const result = await this.repository.createDefinition({
      ...input,
      code: required(input.code, 'badge code', 100),
      category: required(input.category, 'badge category', 80),
      reason: required(input.reason, 'reason', 1000),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge definition is not allowed');
    return result;
  }
}

export class CreateBadgeVersion {
  constructor(private readonly repository: BadgeCoreRepository) {}
  async execute(input: Parameters<BadgeCoreRepository['createVersion']>[0]) {
    if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt)
      throw new ApplicationError('VALIDATION_ERROR', 'badge end must be after start');
    const result = await this.repository.createVersion({
      ...input,
      definitionId: required(input.definitionId, 'definition id'),
      title: required(input.title, 'title', 120),
      description: required(input.description, 'description', 500),
      imageKey: required(input.imageKey, 'image key', 255),
      altText: required(input.altText, 'alt text', 200),
      reason: required(input.reason, 'reason', 1000),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge version is not allowed');
    return result;
  }
}

export class PublishBadgeVersion {
  constructor(private readonly repository: BadgeCoreRepository) {}
  async execute(input: Parameters<BadgeCoreRepository['publishVersion']>[0]) {
    const result = await this.repository.publishVersion({
      ...input,
      definitionId: required(input.definitionId, 'definition id'),
      badgeVersionId: required(input.badgeVersionId, 'badge version id'),
      reason: required(input.reason, 'reason', 1000),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge publish is not allowed');
    return result;
  }
}

export class SaveBadgeProgress {
  constructor(private readonly repository: BadgeCoreRepository) {}
  async execute(input: Parameters<BadgeCoreRepository['saveProgress']>[0]) {
    nonnegative(input.currentValue, 'current value');
    if (!Number.isSafeInteger(input.targetValue) || input.targetValue <= 0)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid target value');
    const result = await this.repository.saveProgress(input);
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge progress is not allowed');
    return result;
  }
}

export class AwardBadge {
  constructor(private readonly repository: BadgeCoreRepository) {}
  async execute(input: Parameters<BadgeCoreRepository['award']>[0]) {
    if (!/^[a-f0-9]{64}$/.test(input.evidenceHash))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence hash');
    const result = await this.repository.award({
      ...input,
      sourceType: required(input.sourceType, 'source type', 100),
      sourceId: required(input.sourceId, 'source id'),
      evidenceHash: required(input.evidenceHash, 'evidence hash', 64),
      idempotencyKey: required(input.idempotencyKey, 'idempotency key'),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge award is not allowed');
    return result;
  }
}

export class RecordBadgeProcessingEvent {
  constructor(private readonly repository: BadgeCoreRepository) {}
  async execute(input: Parameters<BadgeCoreRepository['recordProcessingEvent']>[0]) {
    if (input.status === 'FAILED' && !input.failureCode)
      throw new ApplicationError('VALIDATION_ERROR', 'failed badge event requires a code');
    if (input.status !== 'FAILED' && input.failureCode !== null)
      throw new ApplicationError('VALIDATION_ERROR', 'badge failure code is not allowed');
    const result = await this.repository.recordProcessingEvent({
      ...input,
      eventType: required(input.eventType, 'event type', 100),
      sourceEventId: required(input.sourceEventId, 'source event id'),
      failureCode:
        input.failureCode === null ? null : required(input.failureCode, 'failure code', 100),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge event is not allowed');
    return result;
  }
}
