import { describe, expect, it, vi } from 'vitest';
import { authorizedVideoPhotos } from '../src/video-photos';

const scope = {
  workspaceId: 'workspace-a',
  groupId: 'group-a',
  groupMembershipId: 'membership-a',
  ownerUserId: 'user-a',
};

describe('authorized video photos', () => {
  it('queries the exact workspace, membership, and owner and preserves selection order', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'photo-b', storageKey: 'video-assets/workspace-a/user-a/b' },
      { id: 'photo-a', storageKey: 'video-assets/workspace-a/user-a/a' },
    ]);
    const result = await authorizedVideoPhotos(
      { videoAsset: { findMany } } as never,
      scope,
      ['photo-a', 'photo-b'],
      new Date('2026-09-07T00:00:00Z'),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(scope),
      }),
    );
    expect(result.map((photo) => photo.id)).toEqual(['photo-a', 'photo-b']);
  });

  it('fails closed when another tenant, expired, or unlicensed photo is absent', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await expect(
      authorizedVideoPhotos({ videoAsset: { findMany } } as never, scope, [
        'photo-from-another-user',
      ]),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects duplicate selections and cross-owner storage keys', async () => {
    await expect(
      authorizedVideoPhotos({ videoAsset: { findMany: vi.fn() } } as never, scope, [
        'photo-a',
        'photo-a',
      ]),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      authorizedVideoPhotos(
        {
          videoAsset: {
            findMany: vi
              .fn()
              .mockResolvedValue([
                { id: 'photo-a', storageKey: 'video-assets/workspace-a/user-b/a' },
              ]),
          },
        } as never,
        scope,
        ['photo-a'],
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
