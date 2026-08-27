import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { SupabaseVideoRenderOutputStorage } from '../src/video/video-render-output-storage';

function storageClient() {
  const upload = vi.fn().mockResolvedValue({ data: { path: 'stored' }, error: null });
  const createSignedUrl = vi
    .fn()
    .mockResolvedValue({ data: { signedUrl: 'https://storage.example/signed' }, error: null });
  return {
    upload,
    createSignedUrl,
    value: {
      storage: {
        getBucket: vi.fn().mockResolvedValue({ data: { id: 'video-renders' }, error: null }),
        createBucket: vi.fn(),
        from: vi.fn(() => ({ upload, createSignedUrl })),
      },
    },
  };
}

beforeEach(() => vi.restoreAllMocks());

describe('video render output storage', () => {
  it('downloads a verified Creatomate MP4 into a private scoped key', async () => {
    const fake = storageClient();
    const bytes = new Uint8Array([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(bytes, {
          status: 200,
          headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) },
        }),
      ),
    );
    const storage = new SupabaseVideoRenderOutputStorage(fake.value as never);
    await expect(
      storage.store({
        workspaceId: 'workspace',
        groupId: 'group',
        ownerUserId: 'owner',
        renderId: 'render',
        sourceUrl: 'https://cdn.creatomate.com/result.mp4',
      }),
    ).resolves.toEqual({ storageKey: 'workspace/owner/render.mp4' });
    expect(fake.upload).toHaveBeenCalledWith(
      'workspace/owner/render.mp4',
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'video/mp4', upsert: false }),
    );
  });

  it('rejects an untrusted output host before any download', async () => {
    const fake = storageClient();
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(
      new SupabaseVideoRenderOutputStorage(fake.value as never).store({
        workspaceId: 'workspace',
        groupId: 'group',
        ownerUserId: 'owner',
        renderId: 'render',
        sourceUrl: 'https://attacker.example/result.mp4',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(request).not.toHaveBeenCalled();
  });
});
