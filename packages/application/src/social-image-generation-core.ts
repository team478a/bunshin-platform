import { ApplicationError } from '@bunshin/shared';
import { normalizeSocialImageLayout } from './social-image-templates';
import type {
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
  SocialImageLayout,
  SocialImageTemplateKey,
} from './social-image-templates';

export {
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
  normalizeSocialImageLayout,
  type SocialImageLayout,
  type SocialImageTemplateKey,
} from './social-image-templates';

export const SOCIAL_IMAGE_GENERATION_FEATURE_KEY = 'SOCIAL.IMAGE_GENERATION' as const;

export type SocialImageGenerationStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'GENERATING_ASSET'
  | 'COMPOSING'
  | 'READY_FOR_REVIEW'
  | 'FAILED'
  | 'CANCELLED';

export type SocialImageMediaStatus = 'READY' | 'ADOPTED' | 'REJECTED' | 'DELETED';

export type SocialImageGenerationBlockReason =
  | 'NOT_PRODUCTION'
  | 'PILOT_UNAVAILABLE'
  | 'GROUP_UNAVAILABLE'
  | 'MEMBERSHIP_UNAVAILABLE'
  | 'CONSENT_REQUIRED'
  | 'FEATURE_UNAVAILABLE'
  | 'BUNSHIN_UNAVAILABLE'
  | 'MISSION_UNAVAILABLE'
  | 'MISSION_FORMAT_UNAVAILABLE'
  | 'CAMPAIGN_UNAVAILABLE'
  | 'PRODUCT_UNAVAILABLE'
  | 'SAFETY_BLOCKED'
  | 'LIMIT_REACHED';

export interface SocialImageGenerationRequestRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  ownerUserId: string;
  bunshinId: string;
  dailyMissionId: string;
  campaignId: string | null;
  productPackVersionId: string | null;
  generationContextSnapshotId: string | null;
  pilotEnrollmentId: string;
  status: SocialImageGenerationStatus;
  templateKey: SocialImageTemplateKey;
  layout: SocialImageLayout;
  idempotencyKey: string;
  revision: number;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialImageGeneratedMediaRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  ownerUserId: string;
  dailyMissionId: string;
  requestId: string;
  status: SocialImageMediaStatus;
  sourceStorageKey: string | null;
  completedStorageKey: string;
  thumbnailStorageKey: string;
  width: typeof SOCIAL_IMAGE_WIDTH;
  height: typeof SOCIAL_IMAGE_HEIGHT;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialImageGenerationAuthorizationPort {
  authorize(input: {
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    campaignId: string | null;
    productPackVersionId: string | null;
    now: Date;
  }): Promise<
    | { allowed: true; pilotEnrollmentId: string; generationContextSnapshotId: string | null }
    | { allowed: false; reason: SocialImageGenerationBlockReason }
  >;
}

export interface SocialImageGenerationRequestRepository {
  create(input: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    campaignId: string | null;
    productPackVersionId: string | null;
    generationContextSnapshotId: string | null;
    pilotEnrollmentId: string;
    layout: SocialImageLayout;
    idempotencyKey: string;
  }): Promise<SocialImageGenerationRequestRecord | null>;
  findOwned(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
  }): Promise<SocialImageGenerationRequestRecord | null>;
  transition(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    expectedRevision: number;
    fromStatus: SocialImageGenerationStatus;
    toStatus: SocialImageGenerationStatus;
    errorCode: string | null;
  }): Promise<SocialImageGenerationRequestRecord | null>;
  findMediaOwned(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
  }): Promise<SocialImageGeneratedMediaRecord | null>;
  setMediaStatus(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    mediaId: string;
    status: 'ADOPTED' | 'REJECTED';
  }): Promise<SocialImageGeneratedMediaRecord | null>;
}

export interface SocialImageAssetGenerationProviderPort {
  generate(input: {
    requestId: string;
    prompt: string;
    width: typeof SOCIAL_IMAGE_WIDTH;
    height: typeof SOCIAL_IMAGE_HEIGHT;
    model: string;
    quality: string;
  }): Promise<{
    bytes: Uint8Array;
    mimeType: 'image/png';
    provider: string;
    model: string;
    quality: string;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number;
  }>;
}

export type SocialImageStorageObjectKind = 'SOURCE' | 'COMPLETED' | 'THUMBNAIL';

export interface SocialImageStoragePort {
  store(input: {
    workspaceId: string;
    groupId: string;
    ownerUserId: string;
    requestId: string;
    mediaId: string;
    source: { bytes: Uint8Array; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' } | null;
    completed: Uint8Array;
    thumbnail: Uint8Array;
  }): Promise<{
    sourceStorageKey: string | null;
    completedStorageKey: string;
    thumbnailStorageKey: string;
    contentHash: string;
  }>;
  createReadUrl(input: {
    workspaceId: string;
    groupId: string;
    ownerUserId: string;
    requestId: string;
    mediaId: string;
    kind: SocialImageStorageObjectKind;
    sourceMimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  }): Promise<{ url: string; expiresAt: Date }>;
  remove(input: {
    workspaceId: string;
    groupId: string;
    ownerUserId: string;
    requestId: string;
    mediaId: string;
    sourceMimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  }): Promise<void>;
}

const transitions: Record<SocialImageGenerationStatus, ReadonlySet<SocialImageGenerationStatus>> = {
  DRAFT: new Set(['QUEUED', 'CANCELLED']),
  QUEUED: new Set(['GENERATING_ASSET', 'FAILED', 'CANCELLED']),
  GENERATING_ASSET: new Set(['COMPOSING', 'FAILED', 'CANCELLED']),
  COMPOSING: new Set(['READY_FOR_REVIEW', 'FAILED', 'CANCELLED']),
  READY_FOR_REVIEW: new Set(),
  FAILED: new Set(),
  CANCELLED: new Set(),
};

const uuid = (value: string, field: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
};

const text = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

const optionalUuid = (value: string | null, field: string) => (value ? uuid(value, field) : null);

export const assertSocialImageGenerationTransition = (
  fromStatus: SocialImageGenerationStatus,
  toStatus: SocialImageGenerationStatus,
) => {
  if (!transitions[fromStatus].has(toStatus))
    throw new ApplicationError('CONFLICT', 'invalid social image generation transition');
};

export class CreateSocialImageGenerationRequest {
  constructor(
    private readonly authorization: SocialImageGenerationAuthorizationPort,
    private readonly requests: SocialImageGenerationRequestRepository,
  ) {}

  async execute(input: {
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    actorUserId: string;
    bunshinId: string;
    dailyMissionId: string;
    campaignId: string | null;
    productPackVersionId: string | null;
    layout: SocialImageLayout;
    idempotencyKey: string;
    now?: Date;
  }) {
    if (input.environment !== 'PRODUCTION')
      throw new ApplicationError('FORBIDDEN', 'social image pilot is production only');
    const scope = {
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      groupMembershipId: uuid(input.groupMembershipId, 'groupMembershipId'),
      actorUserId: uuid(input.actorUserId, 'actorUserId'),
      bunshinId: uuid(input.bunshinId, 'bunshinId'),
      dailyMissionId: uuid(input.dailyMissionId, 'dailyMissionId'),
      campaignId: optionalUuid(input.campaignId, 'campaignId'),
      productPackVersionId: optionalUuid(input.productPackVersionId, 'productPackVersionId'),
    };
    const idempotencyKey = text(input.idempotencyKey, 'idempotencyKey', 200);
    if (idempotencyKey.length < 8)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid idempotencyKey');
    const authorized = await this.authorization.authorize({
      environment: input.environment,
      ...scope,
      now: input.now ?? new Date(),
    });
    if (!authorized.allowed)
      throw new ApplicationError(
        'FORBIDDEN',
        `social image generation blocked: ${authorized.reason}`,
      );
    const value = await this.requests.create({
      ...scope,
      generationContextSnapshotId: optionalUuid(
        authorized.generationContextSnapshotId,
        'generationContextSnapshotId',
      ),
      pilotEnrollmentId: uuid(authorized.pilotEnrollmentId, 'pilotEnrollmentId'),
      layout: normalizeSocialImageLayout(input.layout),
      idempotencyKey,
    });
    if (!value)
      throw new ApplicationError('CONFLICT', 'social image generation request unavailable');
    return value;
  }
}

export class GetSocialImageGenerationRequest {
  constructor(private readonly requests: SocialImageGenerationRequestRepository) {}
  async execute(input: Parameters<SocialImageGenerationRequestRepository['findOwned']>[0]) {
    const value = await this.requests.findOwned({
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      actorUserId: uuid(input.actorUserId, 'actorUserId'),
      requestId: uuid(input.requestId, 'requestId'),
    });
    if (!value)
      throw new ApplicationError('NOT_FOUND', 'social image generation request not found');
    return value;
  }
}

export class DecideSocialImageMedia {
  constructor(private readonly requests: SocialImageGenerationRequestRepository) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    mediaId: string;
    decision: 'ADOPTED' | 'REJECTED';
  }) {
    const scope = storageScope(input);
    const request = await this.requests.findOwned({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: scope.ownerUserId,
      requestId: scope.requestId,
    });
    if (!request || request.status !== 'READY_FOR_REVIEW')
      throw new ApplicationError('NOT_FOUND', 'social image generation request not found');
    const value = await this.requests.setMediaStatus({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: scope.ownerUserId,
      requestId: scope.requestId,
      mediaId: scope.mediaId,
      status: input.decision,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'social image decision failed');
    return value;
  }
}

const storageScope = (input: {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
  requestId: string;
  mediaId: string;
}) => ({
  workspaceId: uuid(input.workspaceId, 'workspaceId'),
  groupId: uuid(input.groupId, 'groupId'),
  ownerUserId: uuid(input.actorUserId, 'actorUserId'),
  requestId: uuid(input.requestId, 'requestId'),
  mediaId: uuid(input.mediaId, 'mediaId'),
});

export class StoreSocialImageMediaFiles {
  constructor(
    private readonly requests: SocialImageGenerationRequestRepository,
    private readonly storage: SocialImageStoragePort,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    mediaId: string;
    source: { bytes: Uint8Array; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' } | null;
    completed: Uint8Array;
    thumbnail: Uint8Array;
  }) {
    const scope = storageScope(input);
    const request = await this.requests.findOwned({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: scope.ownerUserId,
      requestId: scope.requestId,
    });
    if (!request)
      throw new ApplicationError('NOT_FOUND', 'social image generation request not found');
    if (request.status !== 'COMPOSING')
      throw new ApplicationError('CONFLICT', 'social image generation request is not composing');
    return this.storage.store({
      ...scope,
      source: input.source,
      completed: input.completed,
      thumbnail: input.thumbnail,
    });
  }
}

export class CreateSocialImageMediaReadUrl {
  constructor(
    private readonly requests: SocialImageGenerationRequestRepository,
    private readonly storage: SocialImageStoragePort,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    mediaId: string;
    kind: SocialImageStorageObjectKind;
    sourceMimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  }) {
    const scope = storageScope(input);
    const request = await this.requests.findOwned({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: scope.ownerUserId,
      requestId: scope.requestId,
    });
    if (!request)
      throw new ApplicationError('NOT_FOUND', 'social image generation request not found');
    const storageInput = {
      ...scope,
      kind: input.kind,
      ...(input.sourceMimeType ? { sourceMimeType: input.sourceMimeType } : {}),
    };
    return this.storage.createReadUrl(storageInput);
  }
}

export class RemoveSocialImageMediaFiles {
  constructor(
    private readonly requests: SocialImageGenerationRequestRepository,
    private readonly storage: SocialImageStoragePort,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    mediaId: string;
    sourceMimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  }) {
    const scope = storageScope(input);
    const request = await this.requests.findOwned({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: scope.ownerUserId,
      requestId: scope.requestId,
    });
    if (!request)
      throw new ApplicationError('NOT_FOUND', 'social image generation request not found');
    await this.storage.remove({
      ...scope,
      ...(input.sourceMimeType ? { sourceMimeType: input.sourceMimeType } : {}),
    });
  }
}

export class TransitionSocialImageGenerationRequest {
  constructor(private readonly requests: SocialImageGenerationRequestRepository) {}
  async execute(input: Parameters<SocialImageGenerationRequestRepository['transition']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    assertSocialImageGenerationTransition(input.fromStatus, input.toStatus);
    const errorCode = input.errorCode?.trim() || null;
    if ((input.toStatus === 'FAILED') !== Boolean(errorCode))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid errorCode');
    if (errorCode && !/^[A-Z][A-Z0-9_]{2,79}$/.test(errorCode))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid errorCode');
    const value = await this.requests.transition({
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      actorUserId: uuid(input.actorUserId, 'actorUserId'),
      requestId: uuid(input.requestId, 'requestId'),
      expectedRevision: input.expectedRevision,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      errorCode,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'social image generation transition failed');
    return value;
  }
}
