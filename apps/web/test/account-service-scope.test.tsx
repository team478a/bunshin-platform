import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  findMembership: vi.fn(),
  findManagedServices: vi.fn(),
  countOrganizations: vi.fn(),
  getDeletionRequest: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.currentUser }),
}));
vi.mock('@bunshin/application', () => ({
  GetAccountDeletionRequest: class {
    execute = mocks.getDeletionRequest;
  },
}));
vi.mock('@bunshin/database', () => ({
  PrismaAccountDeletionRequestRepository: class {},
  prisma: {
    groupMembership: {
      findFirst: mocks.findMembership,
      findMany: mocks.findManagedServices,
    },
    workspaceMembership: { count: mocks.countOrganizations },
  },
}));

import AccountPage from '../app/(app)/account/page';

describe('service-scoped account page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ userId: 'user-a' });
    mocks.getDeletionRequest.mockResolvedValue(null);
    mocks.findMembership.mockResolvedValue({
      group: {
        name: 'ワタシワークス公式',
        workspaceId: 'workspace-a',
        serviceConfiguration: {
          slug: 'watashi-works-official',
          displayName: 'ワタシワークス公式',
          termsUrl: '/s/watashi-works-official/terms',
          privacyUrl: '/s/watashi-works-official/privacy',
        },
      },
    });
    mocks.findManagedServices.mockResolvedValue([
      {
        group: {
          name: 'ワタシワークス公式',
          serviceConfiguration: {
            slug: 'watashi-works-official',
            displayName: 'ワタシワークス公式',
          },
        },
      },
    ]);
  });

  it('shows only the requested service and omits organization-wide navigation', async () => {
    const page = await AccountPage({
      searchParams: Promise.resolve({ service: 'watashi-works-official' }),
    });
    const rendered = renderToStaticMarkup(page);

    expect(rendered).not.toContain('運営者メニュー');
    expect(rendered).not.toContain('ワタシワークス公式を運営する');
    expect(rendered).not.toContain('/s/watashi-works-official/manage');
    expect(rendered).toContain('/s/watashi-works-official/bunshins');
    expect(rendered).toContain('/s/watashi-works-official/line');
    expect(rendered).toContain('LINEの接続・お知らせ設定');
    expect(rendered).not.toContain('運営団体・サービスを管理');
    expect(rendered).not.toContain('知識');
    expect(rendered).not.toContain('グループ');
    expect(mocks.countOrganizations).not.toHaveBeenCalled();
    expect(mocks.findManagedServices).not.toHaveBeenCalled();
  });

  it('does not expose the global account when the user is outside the requested service', async () => {
    mocks.findMembership.mockResolvedValue(null);

    await expect(
      AccountPage({ searchParams: Promise.resolve({ service: 'watashi-works-official' }) }),
    ).rejects.toThrow('REDIRECT:/s/watashi-works-official');
    expect(mocks.findManagedServices).not.toHaveBeenCalled();
  });
});
