import { describe, expect, it, vi } from 'vitest';
import {
  ExternalTrackingMemberLinkService,
  type ExternalTrackingMemberLinkRepository,
} from '../src';

const settings = {
  systems: [
    {
      id: 'system-a',
      name: '代理店サービス',
      domains: [
        {
          id: 'domain-a',
          hostname: 'example.jp',
          allowSubdomains: false,
          shortener: false,
          status: 'ACTIVE' as const,
        },
      ],
    },
  ],
  links: [],
};

function repository(
  overrides: Partial<ExternalTrackingMemberLinkRepository> = {},
): ExternalTrackingMemberLinkRepository {
  return {
    listMemberSettings: vi.fn(() => Promise.resolve(settings)),
    saveMemberDraft: vi.fn(() => Promise.resolve({ id: 'link-a', status: 'DRAFT' })),
    ...overrides,
  };
}

describe('member managed tracking link', () => {
  it('saves a member URL only after validating an operator-approved domain', async () => {
    const saveMemberDraft = vi.fn(() => Promise.resolve({ id: 'link-a', status: 'DRAFT' }));
    const repo = repository({ saveMemberDraft });
    await new ExternalTrackingMemberLinkService(repo).saveDraft({
      workspaceId: 'workspace-a',
      groupId: 'group-a',
      actorUserId: 'user-a',
      systemId: 'system-a',
      allowedDomainId: 'domain-a',
      url: 'https://example.jp/agency?ref=member-a',
    });
    expect(saveMemberDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-a',
        url: 'https://example.jp/agency?ref=member-a',
      }),
    );
  });

  it('rejects a URL outside the approved domain', async () => {
    const saveMemberDraft = vi.fn(() => Promise.resolve({ id: 'link-a', status: 'DRAFT' }));
    const repo = repository({ saveMemberDraft });
    await expect(
      new ExternalTrackingMemberLinkService(repo).saveDraft({
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        actorUserId: 'user-a',
        systemId: 'system-a',
        allowedDomainId: 'domain-a',
        url: 'https://evil.example/agency',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(saveMemberDraft).not.toHaveBeenCalled();
  });

  it('does not accept a system or domain that the operator has not enabled', async () => {
    const saveMemberDraft = vi.fn(() => Promise.resolve({ id: 'link-a', status: 'DRAFT' }));
    const repo = repository({ saveMemberDraft });
    await expect(
      new ExternalTrackingMemberLinkService(repo).saveDraft({
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        actorUserId: 'user-a',
        systemId: 'other-system',
        allowedDomainId: 'other-domain',
        url: 'https://example.jp/agency',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(saveMemberDraft).not.toHaveBeenCalled();
  });
});
