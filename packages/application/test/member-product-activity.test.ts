import { describe, expect, it, vi } from 'vitest';
import {
  MemberProductActivityService,
  type MemberProductActivityRepository,
} from '../src/member-product-activity';

const scope = {
  workspaceId: 'workspace-1',
  groupId: 'service-1',
  actorUserId: 'user-1',
};

function repository(
  overrides: Partial<MemberProductActivityRepository> = {},
): MemberProductActivityRepository {
  return {
    recordGeneration: vi.fn().mockResolvedValue({ id: 'run-1', createdAt: new Date() }),
    recordEvent: vi.fn().mockResolvedValue({ recorded: true }),
    listMemberSummary: vi.fn().mockResolvedValue([]),
    listServiceSummary: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('member product activity service', () => {
  it('records a generation with the owning product, Bunshin and approved link scope', async () => {
    const recordGeneration = vi
      .fn<MemberProductActivityRepository['recordGeneration']>()
      .mockResolvedValue({ id: 'run-1', createdAt: new Date('2026-09-07T00:00:00Z') });
    const service = new MemberProductActivityService(repository({ recordGeneration }));

    await service.recordGeneration({
      ...scope,
      profileId: 'profile-1',
      bunshinId: 'bunshin-1',
      externalTrackingLinkId: 'link-1',
      productPackId: 'product-1',
      platform: 'INSTAGRAM',
      candidateCount: 3,
      operationKey: 'request-1:member-product-suggestions',
    });

    expect(recordGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        ...scope,
        profileId: 'profile-1',
        bunshinId: 'bunshin-1',
        externalTrackingLinkId: 'link-1',
        productPackId: 'product-1',
        candidateCount: 3,
      }),
    );
  });

  it('rejects an event outside the generated candidate range before persistence', async () => {
    const recordEvent = vi.fn<MemberProductActivityRepository['recordEvent']>();
    const service = new MemberProductActivityService(repository({ recordEvent }));

    await expect(
      service.recordEvent({
        ...scope,
        contentRunId: 'run-1',
        type: 'COPIED',
        candidateIndex: 10,
        operationKey: 'copy-1',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it('does not expose another membership when the repository closes the scope', async () => {
    const service = new MemberProductActivityService(
      repository({ recordEvent: vi.fn().mockResolvedValue(null) }),
    );

    await expect(
      service.recordEvent({
        ...scope,
        contentRunId: 'foreign-run',
        type: 'POSTED',
        candidateIndex: 0,
        operationKey: 'post-1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
