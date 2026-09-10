import { describe, expect, it, vi } from 'vitest';
import { authorizedSocialImageVideoSources } from '../src/social-image-video-sources';

const scope = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  groupMembershipId: '33333333-3333-4333-8333-333333333333',
  ownerUserId: '44444444-4444-4444-8444-444444444444',
  requestId: '55555555-5555-4555-8555-555555555555',
};

const pages = () =>
  Array.from({ length: 5 }, (_, pageIndex) => {
    const id = `66666666-6666-4666-8666-66666666666${pageIndex}`;
    return {
      id,
      pageIndex,
      status: pageIndex === 0 ? ('ADOPTED' as const) : ('READY' as const),
      completedStorageKey: `${scope.workspaceId}/${scope.groupId}/${scope.ownerUserId}/${scope.requestId}/${id}/completed.png`,
    };
  });

describe('social image video sources', () => {
  it('returns exactly five ordered, current pages from an adopted owned carousel', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: scope.requestId, media: pages() });
    await expect(
      authorizedSocialImageVideoSources(
        { socialImageGenerationRequest: { findFirst } } as never,
        scope,
      ),
    ).resolves.toHaveLength(5);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: scope.requestId,
          ownerUserId: scope.ownerUserId,
          status: 'READY_FOR_REVIEW',
        }),
      }),
    );
  });

  it('rejects an unadopted or incomplete carousel', async () => {
    const unadopted = pages().map((page) => ({ ...page, status: 'READY' as const }));
    const findFirst = vi.fn().mockResolvedValue({ id: scope.requestId, media: unadopted });
    await expect(
      authorizedSocialImageVideoSources(
        { socialImageGenerationRequest: { findFirst } } as never,
        scope,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
