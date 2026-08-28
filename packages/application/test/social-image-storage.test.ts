import { describe, expect, it, vi } from 'vitest';
import {
  CreateSocialImageMediaReadUrl,
  StoreSocialImageMediaFiles,
  type SocialImageGenerationRequestRecord,
  type SocialImageGenerationRequestRepository,
  type SocialImageStoragePort,
} from '../src';

const ids = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  actorUserId: '33333333-3333-4333-8333-333333333333',
  requestId: '44444444-4444-4444-8444-444444444444',
  mediaId: '55555555-5555-4555-8555-555555555555',
};

function record(status: SocialImageGenerationRequestRecord['status']) {
  return {
    id: ids.requestId,
    workspaceId: ids.workspaceId,
    groupId: ids.groupId,
    groupMembershipId: '66666666-6666-4666-8666-666666666666',
    ownerUserId: ids.actorUserId,
    bunshinId: '77777777-7777-4777-8777-777777777777',
    dailyMissionId: '88888888-8888-4888-8888-888888888888',
    campaignId: null,
    productPackVersionId: null,
    generationContextSnapshotId: null,
    pilotEnrollmentId: '99999999-9999-4999-8999-999999999999',
    status,
    templateKey: 'THREE_POINTS',
    layout: {
      templateKey: 'THREE_POINTS',
      headline: '見出し',
      bodyLines: ['本文'],
      cta: null,
      accentColor: '#FF3B30',
    },
    idempotencyKey: 'request-once',
    revision: 1,
    errorCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as SocialImageGenerationRequestRecord;
}

function dependencies(status: SocialImageGenerationRequestRecord['status'] | null = 'COMPOSING') {
  const findOwned = vi.fn().mockResolvedValue(status ? record(status) : null);
  const requests = {
    findOwned,
  } as unknown as SocialImageGenerationRequestRepository;
  const storage = {
    store: vi.fn().mockResolvedValue({
      sourceStorageKey: null,
      completedStorageKey: 'completed',
      thumbnailStorageKey: 'thumbnail',
      contentHash: 'a'.repeat(64),
    }),
    createReadUrl: vi.fn().mockResolvedValue({
      url: 'https://storage.example/signed',
      expiresAt: new Date(),
    }),
    remove: vi.fn(),
  } satisfies SocialImageStoragePort;
  return { requests, storage, findOwned };
}

describe('social image storage ownership boundary', () => {
  it('stores only while the exact owned request is composing', async () => {
    const { requests, storage, findOwned } = dependencies();
    await new StoreSocialImageMediaFiles(requests, storage).execute({
      ...ids,
      source: null,
      completed: new Uint8Array([1]),
      thumbnail: new Uint8Array([2]),
    });
    expect(findOwned).toHaveBeenCalledWith({
      workspaceId: ids.workspaceId,
      groupId: ids.groupId,
      actorUserId: ids.actorUserId,
      requestId: ids.requestId,
    });
    expect(storage.store).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: ids.actorUserId, mediaId: ids.mediaId }),
    );
  });

  it('does not access storage for another user or unavailable request', async () => {
    const { requests, storage } = dependencies(null);
    await expect(
      new CreateSocialImageMediaReadUrl(requests, storage).execute({
        ...ids,
        kind: 'COMPLETED',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(storage.createReadUrl).not.toHaveBeenCalled();
  });

  it('does not store output after the request leaves composing state', async () => {
    const { requests, storage } = dependencies('READY_FOR_REVIEW');
    await expect(
      new StoreSocialImageMediaFiles(requests, storage).execute({
        ...ids,
        source: null,
        completed: new Uint8Array([1]),
        thumbnail: new Uint8Array([2]),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(storage.store).not.toHaveBeenCalled();
  });
});
