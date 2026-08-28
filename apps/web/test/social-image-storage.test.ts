import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import sharp from 'sharp';
import { SupabaseSocialImageStorage } from '../src/social-image-storage';

const ids = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  ownerUserId: '33333333-3333-4333-8333-333333333333',
  requestId: '44444444-4444-4444-8444-444444444444',
  mediaId: '55555555-5555-4555-8555-555555555555',
};
const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 4, background: '#ffffff' } })
    .png()
    .toBuffer()
    .then((value) => new Uint8Array(value));

function storageClient() {
  const upload = vi.fn().mockResolvedValue({ data: { path: 'stored' }, error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://storage.example/signed' },
    error: null,
  });
  const from = vi.fn(() => ({ upload, remove, createSignedUrl }));
  return {
    upload,
    remove,
    createSignedUrl,
    from,
    value: {
      storage: {
        getBucket: vi.fn().mockResolvedValue({ data: null, error: null }),
        createBucket: vi.fn().mockResolvedValue({ data: {}, error: null }),
        from,
      },
    },
  };
}

beforeEach(() => vi.restoreAllMocks());

describe('social image private storage', () => {
  it('creates a private bucket and stores all files under the exact owner scope', async () => {
    const fake = storageClient();
    const storage = new SupabaseSocialImageStorage(fake.value as never);
    const completed = await png(1080, 1350);
    const thumbnail = await png(320, 400);
    const result = await storage.store({
      ...ids,
      source: { bytes: completed, mimeType: 'image/png' },
      completed,
      thumbnail,
    });
    const prefix = Object.values(ids).join('/');
    expect(fake.value.storage.createBucket).toHaveBeenCalledWith(
      'social-image-media',
      expect.objectContaining({ public: false }),
    );
    expect(result).toMatchObject({
      sourceStorageKey: `${prefix}/source.png`,
      completedStorageKey: `${prefix}/completed.png`,
      thumbnailStorageKey: `${prefix}/thumbnail.png`,
    });
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fake.upload).toHaveBeenCalledTimes(3);
    expect(fake.upload).toHaveBeenCalledWith(
      `${prefix}/completed.png`,
      completed,
      expect.objectContaining({ contentType: 'image/png', upsert: false }),
    );
  });

  it('rejects a forged or traversing scope before accessing storage', async () => {
    const fake = storageClient();
    await expect(
      new SupabaseSocialImageStorage(fake.value as never).createReadUrl({
        ...ids,
        ownerUserId: '../another-user',
        kind: 'COMPLETED',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('issues only a five-minute signed URL for the derived object key', async () => {
    const fake = storageClient();
    const result = await new SupabaseSocialImageStorage(fake.value as never).createReadUrl({
      ...ids,
      kind: 'THUMBNAIL',
    });
    expect(result.url).toBe('https://storage.example/signed');
    expect(fake.createSignedUrl).toHaveBeenCalledWith(
      `${Object.values(ids).join('/')}/thumbnail.png`,
      300,
    );
  });

  it('removes files already stored when a later upload fails', async () => {
    const fake = storageClient();
    fake.upload
      .mockResolvedValueOnce({ data: { path: 'source' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'failed' } });
    const completed = await png(1080, 1350);
    const thumbnail = await png(320, 400);
    await expect(
      new SupabaseSocialImageStorage(fake.value as never).store({
        ...ids,
        source: { bytes: completed, mimeType: 'image/png' },
        completed,
        thumbnail,
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(fake.remove).toHaveBeenCalledWith([`${Object.values(ids).join('/')}/source.png`]);
  });

  it('rejects a file whose declared MIME does not match its signature', async () => {
    const fake = storageClient();
    const completed = await png(1080, 1350);
    const thumbnail = await png(320, 400);
    await expect(
      new SupabaseSocialImageStorage(fake.value as never).store({
        ...ids,
        source: { bytes: completed, mimeType: 'image/jpeg' },
        completed,
        thumbnail,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fake.value.storage.getBucket).not.toHaveBeenCalled();
  });

  it('rejects a completed image outside the fixed 1080 by 1350 layout', async () => {
    const fake = storageClient();
    await expect(
      new SupabaseSocialImageStorage(fake.value as never).store({
        ...ids,
        source: null,
        completed: await png(1080, 1080),
        thumbnail: await png(320, 400),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fake.value.storage.getBucket).not.toHaveBeenCalled();
  });
});
