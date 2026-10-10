import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApplicationError } from '@bunshin/shared';
const f = vi.hoisted(() => ({ actor: vi.fn(), service: vi.fn(), access: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('REDIRECT');
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => ({ getCurrentUser: f.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: f.service }));
vi.mock('../src/services/personal-learning-preparation-access', () => ({
  personalLearningPreparationAccess: f.access,
}));
vi.mock('../app/ui/public-shell', () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import Page from '../app/s/[serviceSlug]/manage/programs/learning-definition-review/page';
const props = { params: Promise.resolve({ serviceSlug: 'synthetic' }) };
describe('Definition review server gate', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.resetAllMocks();
    f.actor.mockResolvedValue({ userId: 'actor' });
    f.service.mockResolvedValue({
      workspaceId: 'workspace',
      serviceId: 'service',
      serviceRole: 'SERVICE_OWNER',
    });
    f.access.mockReturnValue({ workspaceId: 'workspace', groupId: 'service' });
  });
  it('unauthenticated redirects before service/config lookup', async () => {
    f.actor.mockResolvedValue(null);
    await expect(Page(props)).rejects.toThrow('REDIRECT');
    expect(f.service).not.toHaveBeenCalled();
    expect(f.access).not.toHaveBeenCalled();
  });
  it.each(['PARTICIPANT', 'CONTENT_EDITOR'])(
    'rejects %s before exposing review',
    async (serviceRole) => {
      f.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'service', serviceRole });
      await expect(Page(props)).rejects.toThrow('NOT_FOUND');
      expect(f.access).not.toHaveBeenCalled();
    },
  );
  it('foreign service denied and unexpected resolver failure not swallowed', async () => {
    f.service.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
    await expect(Page(props)).rejects.toThrow('NOT_FOUND');
    f.service.mockRejectedValue(new ApplicationError('NOT_FOUND', 'invalid slug'));
    await expect(Page(props)).rejects.toThrow('NOT_FOUND');
    f.service.mockRejectedValue(new Error('database failure'));
    await expect(Page(props)).rejects.toThrow('database failure');
  });
  it('missing flag/stopped gate or mismatched authority only renders inactive guidance', async () => {
    f.access.mockImplementation(() => {
      throw new ApplicationError('NOT_FOUND', 'disabled');
    });
    expect(renderToStaticMarkup(await Page(props))).toContain('承認操作は利用できません');
    f.access.mockReturnValue({ workspaceId: 'foreign', groupId: 'service' });
    expect(renderToStaticMarkup(await Page(props))).not.toContain('<button');
    f.access.mockReturnValue({ workspaceId: 'workspace', groupId: 'foreign' });
    expect(renderToStaticMarkup(await Page(props))).not.toContain('<button');
  });
  it.each(['SERVICE_OWNER', 'SERVICE_ADMIN'])(
    '%s can explicitly read only, no automatic HTTP/DB mutation',
    async (serviceRole) => {
      f.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'service', serviceRole });
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      expect(renderToStaticMarkup(await Page(props))).toContain('現在の定義と承認状態を確認');
      expect(fetcher).not.toHaveBeenCalled();
      expect(f.service).toHaveBeenCalledWith('synthetic', 'actor');
      expect(f.access).toHaveBeenCalledWith('PERSONAL_LEARNING_DEFINITION_ADMIN');
    },
  );
  it('unexpected configuration failure propagates', async () => {
    f.access.mockImplementation(() => {
      throw new Error('config failure');
    });
    await expect(Page(props)).rejects.toThrow('config failure');
  });
});
