import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const f = vi.hoisted(() => ({
  actor: vi.fn(),
  service: vi.fn(),
  target: vi.fn(),
  participant: vi.fn(),
}));
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
vi.mock('../src/services/personal-learning-program-preparation', () => ({
  programPreparationTarget: f.target,
  participantConfigurationTarget: f.participant,
}));
vi.mock('../app/ui/public-shell', () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import Page from '../app/s/[serviceSlug]/manage/programs/personal-learning-preparation/page';
const props = { params: Promise.resolve({ serviceSlug: 'test' }) };
describe('Program preparation server page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.actor.mockResolvedValue({ userId: 'actor' });
    f.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'service' });
    f.target.mockReturnValue(null);
    f.participant.mockReturnValue(null);
  });
  it('redirects unauthenticated access before resolving Service', async () => {
    f.actor.mockResolvedValue(null);
    await expect(Page(props)).rejects.toThrow('REDIRECT');
    expect(f.service).not.toHaveBeenCalled();
  });
  it('rejects unauthorized/foreign Service before reading preparation authority', async () => {
    f.service.mockRejectedValue(new Error('denied'));
    await expect(Page(props)).rejects.toThrow('NOT_FOUND');
    expect(f.target).not.toHaveBeenCalled();
    expect(f.participant).not.toHaveBeenCalled();
  });
  it('can show participant configuration independently of the create operation flag', async () => {
    f.participant.mockReturnValue('33333333-3333-4333-8333-333333333333');
    const html = renderToStaticMarkup(await Page(props));
    expect(html).toContain('現在の人数設定を確認');
    expect(html).not.toContain('停止状態で人数設定を保存</button>');
  });
  it('renders read-only guidance when configuration is missing', async () => {
    const html = renderToStaticMarkup(await Page(props));
    expect(html).toContain('作成操作は利用できません');
    expect(html).not.toContain('<button');
    expect(f.service).toHaveBeenCalledWith('test', 'actor');
  });
  it('renders only the server-bound target, without automatically reading or creating Program', async () => {
    f.target.mockReturnValue('33333333-3333-4333-8333-333333333333');
    const html = renderToStaticMarkup(await Page(props));
    expect(html).toContain('33333333-3333-4333-8333-333333333333');
    expect(html).toContain('現在の状態を確認');
    expect(html).not.toContain('停止状態で作成</button>');
  });
});
