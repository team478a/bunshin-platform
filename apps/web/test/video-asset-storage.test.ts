import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseVideoAssetStorage } from '../src/video/video-asset-storage';

function storageClient() {
  const createBucket = vi.fn().mockResolvedValue({ data: {}, error: null });
  const createSignedUploadUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/key?token=safe' },
    error: null,
  });
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://project.supabase.co/storage/v1/object/sign/key?token=safe' },
    error: null,
  });
  const client = {
    storage: {
      getBucket: vi.fn().mockResolvedValue({ data: null, error: null }),
      createBucket,
      from: vi.fn(() => ({ createSignedUploadUrl, createSignedUrl })),
    },
  };
  return { client, createBucket, createSignedUploadUrl, createSignedUrl };
}

describe('SupabaseVideoAssetStorage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates a private constrained bucket and a short signed upload', async () => {
    const fake = storageClient();
    const adapter = new SupabaseVideoAssetStorage({
      client: fake.client,
      configuration: { publicKey: 'public-key' },
    } as never);
    const result = await adapter.createUploadAuthorization({
      storageKey: 'video-assets/workspace/user/id',
      mimeType: 'image/png',
      sizeBytes: 24,
    });
    expect(fake.createBucket).toHaveBeenCalledWith(
      'video-assets',
      expect.objectContaining({ public: false, fileSizeLimit: 200_000_000 }),
    );
    expect(fake.createSignedUploadUrl).toHaveBeenCalledWith('video-assets/workspace/user/id', {
      upsert: false,
    });
    expect(result).toMatchObject({ method: 'PUT', headers: { 'content-type': 'image/png' } });
  });

  it('recognizes PNG bytes instead of trusting the declared content type', async () => {
    const fake = storageClient();
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    new DataView(bytes.buffer).setUint32(16, 1080);
    new DataView(bytes.buffer).setUint32(20, 1920);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(bytes, {
          status: 206,
          headers: { 'content-range': 'bytes 0-23/24', 'content-length': '24' },
        }),
      ),
    );
    const adapter = new SupabaseVideoAssetStorage({
      client: fake.client,
      configuration: { publicKey: 'public-key' },
    } as never);
    await expect(
      adapter.inspectUploadedObject({ storageKey: 'video-assets/workspace/user/id' }),
    ).resolves.toMatchObject({
      mimeType: 'image/png',
      sizeBytes: 24,
      width: 1080,
      height: 1920,
      signatureVerified: true,
    });
  });

  it('does not approve bytes with an unknown signature', async () => {
    const fake = storageClient();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array(32), {
          status: 206,
          headers: { 'content-range': 'bytes 0-31/32' },
        }),
      ),
    );
    const adapter = new SupabaseVideoAssetStorage({
      client: fake.client,
      configuration: { publicKey: 'public-key' },
    } as never);
    await expect(
      adapter.inspectUploadedObject({ storageKey: 'video-assets/workspace/user/id' }),
    ).resolves.toMatchObject({
      mimeType: 'application/octet-stream',
      signatureVerified: false,
    });
  });
});
