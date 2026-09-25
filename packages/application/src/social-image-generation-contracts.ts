import type { SocialImageQualityReportRecord } from './social-image-generation-job';
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

export type SocialImageReference = { sha256: string; rightsConfirmed: true };

export interface SocialImageGenerationRequestRecord {
  referenceImage?: SocialImageReference | null;
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
  qualityReport: SocialImageQualityReportRecord | null;
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
  pageIndex: number;
  status: SocialImageMediaStatus;
  reviewReason: string | null;
  reviewNote: string | null;
  sourceStorageKey: string | null;
  completedStorageKey: string;
  thumbnailStorageKey: string;
  width: typeof SOCIAL_IMAGE_WIDTH;
  height: typeof SOCIAL_IMAGE_HEIGHT;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SocialImageReviewReason =
  'TEXT_HARD_TO_READ' | 'CONTENT_MISMATCH' | 'PHOTO_UNNATURAL' | 'DESIGN_UNAPPEALING' | 'OTHER';

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
    referenceImage?: SocialImageReference | null;
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
  listMediaOwned(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
  }): Promise<SocialImageGeneratedMediaRecord[]>;
  setMediaStatus(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    mediaId: string;
    status: 'ADOPTED' | 'REJECTED';
    reviewReason: SocialImageReviewReason | null;
    reviewNote: string | null;
  }): Promise<SocialImageGeneratedMediaRecord | null>;
  replaceMediaPage(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    requestId: string;
    expectedRevision: number;
    currentMediaId: string;
    pageIndex: number;
    layout: SocialImageLayout;
    replacement: {
      mediaId: string;
      sourceStorageKey: string | null;
      completedStorageKey: string;
      thumbnailStorageKey: string;
      contentHash: string;
    };
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
    referenceImage?: Uint8Array;
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
    downloadFilename?: string;
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
