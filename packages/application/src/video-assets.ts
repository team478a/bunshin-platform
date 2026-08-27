import { ApplicationError } from '@bunshin/shared';

export type VideoAssetKind = 'IMAGE' | 'VIDEO' | 'LOGO';
export type VideoAssetStatus = 'PENDING_UPLOAD' | 'READY' | 'REJECTED' | 'DELETED';

export interface VideoAssetRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  ownerUserId: string;
  videoProjectId: string | null;
  kind: VideoAssetKind;
  status: VideoAssetStatus;
  storageKey: string;
  originalFilename: string;
  declaredMimeType: string;
  verifiedMimeType: string | null;
  declaredSizeBytes: number;
  verifiedSizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  rightsConfirmedAt: Date;
  usageTerms: string | null;
  failureCode: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoAssetRepository {
  createPending(input: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    actorUserId: string;
    videoProjectId: string | null;
    kind: VideoAssetKind;
    originalFilename: string;
    declaredMimeType: string;
    declaredSizeBytes: number;
    usageTerms: string | null;
  }): Promise<VideoAssetRecord | null>;
  findOwned(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    assetId: string;
  }): Promise<VideoAssetRecord | null>;
  markReady(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    assetId: string;
    verifiedMimeType: string;
    verifiedSizeBytes: number;
    width: number | null;
    height: number | null;
    durationMs: number | null;
  }): Promise<VideoAssetRecord | null>;
  reject(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    assetId: string;
    failureCode: string;
  }): Promise<void>;
  listReadyOwned(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId?: string | null;
  }): Promise<VideoAssetRecord[]>;
}

export interface VideoAssetStoragePort {
  createUploadAuthorization(input: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<{
    method: 'PUT';
    uploadUrl: string;
    headers: Record<string, string>;
    expiresAt: Date;
  }>;
  inspectUploadedObject(input: { storageKey: string }): Promise<{
    mimeType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    signatureVerified: boolean;
  }>;
}

const uuid = (value: string, field: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
};

const limits: Record<VideoAssetKind, { mimeTypes: string[]; maxBytes: number }> = {
  IMAGE: { mimeTypes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 20_000_000 },
  LOGO: { mimeTypes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 20_000_000 },
  VIDEO: { mimeTypes: ['video/mp4', 'video/quicktime'], maxBytes: 200_000_000 },
};

function uploadInput(input: {
  kind: VideoAssetKind;
  originalFilename: string;
  declaredMimeType: string;
  declaredSizeBytes: number;
}) {
  const filename = input.originalFilename.trim();
  if (
    !filename ||
    filename.length > 255 ||
    /[\\/]/.test(filename) ||
    [...filename].some((character) => character.charCodeAt(0) < 32)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid originalFilename');
  const limit = limits[input.kind];
  if (!limit || !limit.mimeTypes.includes(input.declaredMimeType))
    throw new ApplicationError('VALIDATION_ERROR', 'unsupported asset mime type');
  if (
    !Number.isInteger(input.declaredSizeBytes) ||
    input.declaredSizeBytes < 1 ||
    input.declaredSizeBytes > limit.maxBytes
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid asset size');
  return { filename, limit };
}

export class PrepareVideoAssetUpload {
  constructor(
    private readonly assets: VideoAssetRepository,
    private readonly storage: VideoAssetStoragePort,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    actorUserId: string;
    videoProjectId?: string | null;
    kind: VideoAssetKind;
    originalFilename: string;
    declaredMimeType: string;
    declaredSizeBytes: number;
    rightsConfirmed: boolean;
    usageTerms?: string | null;
  }) {
    if (!input.rightsConfirmed)
      throw new ApplicationError('VALIDATION_ERROR', 'asset rights confirmation is required');
    const normalized = uploadInput(input);
    const scope = {
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      groupMembershipId: uuid(input.groupMembershipId, 'groupMembershipId'),
      actorUserId: uuid(input.actorUserId, 'actorUserId'),
      videoProjectId: input.videoProjectId ? uuid(input.videoProjectId, 'videoProjectId') : null,
    };
    const asset = await this.assets.createPending({
      ...scope,
      kind: input.kind,
      originalFilename: normalized.filename,
      declaredMimeType: input.declaredMimeType,
      declaredSizeBytes: input.declaredSizeBytes,
      usageTerms: input.usageTerms?.trim() || null,
    });
    if (!asset) throw new ApplicationError('FORBIDDEN', 'video asset upload unavailable');
    try {
      const authorization = await this.storage.createUploadAuthorization({
        storageKey: asset.storageKey,
        mimeType: asset.declaredMimeType,
        sizeBytes: asset.declaredSizeBytes,
      });
      return { asset, authorization };
    } catch (error) {
      await this.assets.reject({
        ...scope,
        assetId: asset.id,
        failureCode: 'UPLOAD_AUTHORIZATION_FAILED',
      });
      throw error;
    }
  }
}

export class CompleteVideoAssetUpload {
  constructor(
    private readonly assets: VideoAssetRepository,
    private readonly storage: VideoAssetStoragePort,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    assetId: string;
  }) {
    const scope = {
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      actorUserId: uuid(input.actorUserId, 'actorUserId'),
      assetId: uuid(input.assetId, 'assetId'),
    };
    const asset = await this.assets.findOwned(scope);
    if (!asset) throw new ApplicationError('NOT_FOUND', 'video asset not found');
    if (asset.status !== 'PENDING_UPLOAD')
      throw new ApplicationError('CONFLICT', 'video asset upload is not pending');
    let inspected: Awaited<ReturnType<VideoAssetStoragePort['inspectUploadedObject']>>;
    try {
      inspected = await this.storage.inspectUploadedObject({ storageKey: asset.storageKey });
    } catch (error) {
      await this.assets.reject({ ...scope, failureCode: 'UPLOAD_INSPECTION_UNAVAILABLE' });
      throw error;
    }
    const limit = limits[asset.kind];
    const valid =
      inspected.signatureVerified &&
      limit.mimeTypes.includes(inspected.mimeType) &&
      inspected.sizeBytes > 0 &&
      inspected.sizeBytes <= limit.maxBytes &&
      inspected.sizeBytes <= asset.declaredSizeBytes &&
      (asset.kind === 'VIDEO'
        ? inspected.durationMs !== null &&
          inspected.durationMs > 0 &&
          inspected.durationMs <= 120_000
        : inspected.width !== null &&
          inspected.width > 0 &&
          inspected.height !== null &&
          inspected.height > 0);
    if (!valid) {
      await this.assets.reject({ ...scope, failureCode: 'UPLOAD_INSPECTION_FAILED' });
      throw new ApplicationError('VALIDATION_ERROR', 'uploaded video asset is invalid');
    }
    const completed = await this.assets.markReady({
      ...scope,
      verifiedMimeType: inspected.mimeType,
      verifiedSizeBytes: inspected.sizeBytes,
      width: inspected.width,
      height: inspected.height,
      durationMs: inspected.durationMs,
    });
    if (!completed) throw new ApplicationError('CONFLICT', 'video asset upload changed');
    return completed;
  }
}

export class ListReadyVideoAssets {
  constructor(private readonly assets: VideoAssetRepository) {}
  execute(input: Parameters<VideoAssetRepository['listReadyOwned']>[0]) {
    return this.assets.listReadyOwned({
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      actorUserId: uuid(input.actorUserId, 'actorUserId'),
      videoProjectId: input.videoProjectId ? uuid(input.videoProjectId, 'videoProjectId') : null,
    });
  }
}
