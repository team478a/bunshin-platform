import { describe, expect, it, vi } from 'vitest';
import {
  CompleteVideoAssetUpload,
  ListReadyVideoAssets,
  PrepareVideoAssetUpload,
  type VideoAssetRecord,
  type VideoAssetRepository,
  type VideoAssetStoragePort,
} from '../src';

const ids = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  groupMembershipId: '33333333-3333-4333-8333-333333333333',
  actorUserId: '44444444-4444-4444-8444-444444444444',
  videoProjectId: '55555555-5555-4555-8555-555555555555',
  assetId: '66666666-6666-4666-8666-666666666666',
};

const pending: VideoAssetRecord = {
  id: ids.assetId,
  ...ids,
  ownerUserId: ids.actorUserId,
  kind: 'IMAGE',
  status: 'PENDING_UPLOAD',
  storageKey: 'video-assets/scoped/object',
  originalFilename: '商品.jpg',
  declaredMimeType: 'image/jpeg',
  verifiedMimeType: null,
  declaredSizeBytes: 1000,
  verifiedSizeBytes: null,
  width: null,
  height: null,
  durationMs: null,
  rightsConfirmedAt: new Date('2026-08-27T00:00:00Z'),
  usageTerms: null,
  failureCode: null,
  expiresAt: null,
  createdAt: new Date('2026-08-27T00:00:00Z'),
  updatedAt: new Date('2026-08-27T00:00:00Z'),
};

function dependencies() {
  const assets: VideoAssetRepository = {
    createPending: vi.fn().mockResolvedValue(pending),
    findOwned: vi.fn().mockResolvedValue(pending),
    markReady: vi.fn().mockResolvedValue({ ...pending, status: 'READY' }),
    reject: vi.fn().mockResolvedValue(undefined),
    listReadyOwned: vi.fn().mockResolvedValue([{ ...pending, status: 'READY' }]),
  };
  const storage: VideoAssetStoragePort = {
    createUploadAuthorization: vi.fn().mockResolvedValue({
      method: 'PUT',
      uploadUrl: 'https://storage.example.test/signed',
      headers: { 'content-type': 'image/jpeg' },
      expiresAt: new Date('2026-08-27T00:05:00Z'),
    }),
    inspectUploadedObject: vi.fn().mockResolvedValue({
      mimeType: 'image/jpeg',
      sizeBytes: 900,
      width: 1080,
      height: 1920,
      durationMs: null,
      signatureVerified: true,
    }),
  };
  return { assets, storage };
}

describe('video asset upload core', () => {
  it('requires an explicit rights confirmation before creating storage state', async () => {
    const { assets, storage } = dependencies();
    await expect(
      new PrepareVideoAssetUpload(assets, storage).execute({
        ...ids,
        kind: 'IMAGE',
        originalFilename: '商品.jpg',
        declaredMimeType: 'image/jpeg',
        declaredSizeBytes: 1000,
        rightsConfirmed: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(assets.createPending).not.toHaveBeenCalled();
  });

  it('fails closed before issuing an upload URL when ownership is unavailable', async () => {
    const { assets, storage } = dependencies();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(assets.createPending).mockResolvedValueOnce(null);
    await expect(
      new PrepareVideoAssetUpload(assets, storage).execute({
        ...ids,
        kind: 'IMAGE',
        originalFilename: '商品.jpg',
        declaredMimeType: 'image/jpeg',
        declaredSizeBytes: 1000,
        rightsConfirmed: true,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(storage.createUploadAuthorization).not.toHaveBeenCalled();
  });

  it('records authorization provider failures against the pending asset', async () => {
    const { assets, storage } = dependencies();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(storage.createUploadAuthorization).mockRejectedValueOnce(new Error('offline'));
    await expect(
      new PrepareVideoAssetUpload(assets, storage).execute({
        ...ids,
        kind: 'IMAGE',
        originalFilename: '商品.jpg',
        declaredMimeType: 'image/jpeg',
        declaredSizeBytes: 1000,
        rightsConfirmed: true,
      }),
    ).rejects.toThrow('offline');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(assets.reject).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: ids.assetId, failureCode: 'UPLOAD_AUTHORIZATION_FAILED' }),
    );
  });

  it('accepts only inspected image bytes and stores verified metadata', async () => {
    const { assets, storage } = dependencies();
    await new CompleteVideoAssetUpload(assets, storage).execute({
      workspaceId: ids.workspaceId,
      groupId: ids.groupId,
      actorUserId: ids.actorUserId,
      assetId: ids.assetId,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(assets.markReady).toHaveBeenCalledWith(
      expect.objectContaining({ verifiedMimeType: 'image/jpeg', width: 1080, height: 1920 }),
    );
  });

  it('rejects spoofed or invalid uploaded bytes', async () => {
    const { assets, storage } = dependencies();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(storage.inspectUploadedObject).mockResolvedValueOnce({
      mimeType: 'image/jpeg',
      sizeBytes: 900,
      width: 1080,
      height: 1920,
      durationMs: null,
      signatureVerified: false,
    });
    await expect(
      new CompleteVideoAssetUpload(assets, storage).execute({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        actorUserId: ids.actorUserId,
        assetId: ids.assetId,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(assets.reject).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'UPLOAD_INSPECTION_FAILED' }),
    );
  });

  it('records inspection provider failures against the pending asset', async () => {
    const { assets, storage } = dependencies();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(storage.inspectUploadedObject).mockRejectedValueOnce(new Error('storage offline'));
    await expect(
      new CompleteVideoAssetUpload(assets, storage).execute({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        actorUserId: ids.actorUserId,
        assetId: ids.assetId,
      }),
    ).rejects.toThrow('storage offline');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(assets.reject).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'UPLOAD_INSPECTION_UNAVAILABLE' }),
    );
  });

  it('lists assets through the exact owner scope', async () => {
    const { assets } = dependencies();
    await new ListReadyVideoAssets(assets).execute({
      workspaceId: ids.workspaceId,
      groupId: ids.groupId,
      actorUserId: ids.actorUserId,
      videoProjectId: ids.videoProjectId,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(assets.listReadyOwned).toHaveBeenCalledWith({
      workspaceId: ids.workspaceId,
      groupId: ids.groupId,
      actorUserId: ids.actorUserId,
      videoProjectId: ids.videoProjectId,
    });
  });
});
