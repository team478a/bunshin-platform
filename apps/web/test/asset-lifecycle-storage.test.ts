import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { SupabaseAssetLifecycleStorage } from '../src/assets/asset-lifecycle-storage';

describe('asset lifecycle deletion', () => {
  it('treats an absent bucket as already deleted', async () => {
    const remove = vi.fn().mockResolvedValue({ error: { status: 404 } });
    const storage = new SupabaseAssetLifecycleStorage({
      storage: { from: () => ({ remove }) },
    } as never);
    await expect(
      storage.remove({ bucket: 'video-renders', keys: ['workspace/owner/render.mp4'] }),
    ).resolves.toBeUndefined();
  });
  it.each([401, 403, 500])('preserves failure for status %s', async (status) => {
    const remove = vi.fn().mockResolvedValue({ error: { status } });
    const storage = new SupabaseAssetLifecycleStorage({
      storage: { from: () => ({ remove }) },
    } as never);
    await expect(
      storage.remove({ bucket: 'video-renders', keys: ['workspace/owner/render.mp4'] }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
  it('does not silently omit invalid keys from a multi-file deletion', async () => {
    const remove = vi.fn();
    const storage = new SupabaseAssetLifecycleStorage({
      storage: { from: () => ({ remove }) },
    } as never);
    await expect(
      storage.remove({ bucket: 'social-image-media', keys: ['valid.png', '../invalid.png'] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(remove).not.toHaveBeenCalled();
  });
});
