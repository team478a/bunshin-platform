import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { SupabaseVideoSceneOutputStorage } from '../src/video/fal-video-scene-output-storage';

function storageClient() {
  const upload = vi.fn().mockResolvedValue({ data: { path: 'stored' }, error: null });
  return {
    upload,
    value: {
      storage: {
        getBucket: vi.fn().mockResolvedValue({ data: { id: 'video-ai-scenes' }, error: null }),
        createBucket: vi.fn().mockResolvedValue({ data: {}, error: null }),
        from: vi.fn(() => ({
          upload,
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://storage.example/signed' },
            error: null,
          }),
        })),
      },
    },
  };
}

beforeEach(() => vi.restoreAllMocks());

describe('xAI video output storage', () => {
  it('downloads only an MP4 from the allowlisted xAI host into a private scoped key', async () => {
    const fake = storageClient();
    const bytes = new Uint8Array([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const request = vi.fn().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) },
      }),
    );
    vi.stubGlobal('fetch', request);

    await expect(
      new SupabaseVideoSceneOutputStorage(fake.value as never).store({
        workspaceId: 'workspace',
        groupId: 'group',
        ownerUserId: 'owner',
        generationId: 'generation',
        sourceUrl: 'https://vidgen.x.ai/xai-vidgen-bucket/result.mp4',
      }),
    ).resolves.toEqual({ storageKey: 'workspace/owner/generation.mp4' });
    expect(request).toHaveBeenCalledWith(
      'https://vidgen.x.ai/xai-vidgen-bucket/result.mp4',
      expect.objectContaining({ redirect: 'error', cache: 'no-store' }),
    );
    expect(fake.upload).toHaveBeenCalledWith(
      'workspace/owner/generation.mp4',
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'video/mp4', upsert: false }),
    );
  });

  it('rejects any other source host before downloading', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(
      new SupabaseVideoSceneOutputStorage(storageClient().value as never).store({
        workspaceId: 'workspace',
        groupId: 'group',
        ownerUserId: 'owner',
        generationId: 'generation',
        sourceUrl: 'https://attacker.example/result.mp4',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(request).not.toHaveBeenCalled();
  });
});
