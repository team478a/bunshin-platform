import { describe, expect, it, vi } from 'vitest';
import { ExternalTrackingLinkService, type ExternalTrackingLinkRepository } from '../src';

const domain = {
  id: 'domain-a',
  hostname: 'example.jp',
  allowSubdomains: false,
  shortener: false,
  status: 'ACTIVE' as const,
};

function repository(overrides: Partial<ExternalTrackingLinkRepository> = {}) {
  return {
    listConfiguration: vi.fn(() => Promise.resolve({ links: [] })),
    getAllowedDomain: vi.fn(() => Promise.resolve(domain)),
    createSystem: vi.fn(() => Promise.resolve({})),
    addAllowedDomain: vi.fn(() => Promise.resolve({})),
    upsertMemberIdentity: vi.fn(() => Promise.resolve({})),
    createLink: vi.fn(() => Promise.resolve({ id: 'link-a' })),
    activateLink: vi.fn(() => Promise.resolve({})),
    suspendLink: vi.fn(() => Promise.resolve({})),
    updateLink: vi.fn(() => Promise.resolve({})),
    listResolutionCandidates: vi.fn(() => Promise.resolve(null)),
    ...overrides,
  } satisfies ExternalTrackingLinkRepository;
}

describe('external tracking link admin service', () => {
  it('許可domainをDBから取得してからURLを登録する', async () => {
    const repo = repository();
    const service = new ExternalTrackingLinkService(repo);
    await service.createLink({
      workspaceId: 'workspace-a',
      actorUserId: 'user-a',
      systemId: 'system-a',
      allowedDomainId: domain.id,
      scopeType: 'GROUP',
      name: 'グループ共通',
      url: 'https://example.jp/product?ref=GROUP',
    });
    expect(repo.getAllowedDomain).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      actorUserId: 'user-a',
      allowedDomainId: domain.id,
    });
    expect(repo.createLink).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.jp/product?ref=GROUP' }),
    );
  });

  it('利用できないdomainならrepositoryへURLを保存しない', async () => {
    const repo = repository({ getAllowedDomain: vi.fn(() => Promise.resolve(null)) });
    const service = new ExternalTrackingLinkService(repo);
    await expect(
      service.createLink({
        workspaceId: 'workspace-a',
        actorUserId: 'user-a',
        systemId: 'system-a',
        allowedDomainId: 'other-domain',
        scopeType: 'GROUP',
        name: '不正URL',
        url: 'https://evil.example/product',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.createLink).not.toHaveBeenCalled();
  });

  it('ACTIVE URLは編集Serviceから変更できずrepositoryで状態を制限する契約にする', async () => {
    const repo = repository({ updateLink: vi.fn(() => Promise.resolve(null)) });
    const service = new ExternalTrackingLinkService(repo);
    await expect(
      service.updateLink({
        workspaceId: 'workspace-a',
        actorUserId: 'user-a',
        linkId: 'active-link',
        allowedDomainId: domain.id,
        name: '変更',
        url: 'https://example.jp/new?ref=A',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
