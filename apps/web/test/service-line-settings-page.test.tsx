import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  settings: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.actor }),
}));
vi.mock('../src/services/service-line-settings', () => ({
  loadServiceLineSettings: mocks.settings,
}));
vi.mock('../app/ui/public-shell', () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => children,
}));
import ServiceLineSettingsPage from '../app/s/[serviceSlug]/line/page';
const render = async () =>
  renderToStaticMarkup(
    await ServiceLineSettingsPage({
      params: Promise.resolve({ serviceSlug: 'service-a' }),
      searchParams: Promise.resolve({}),
    }),
  );
describe('LINE connection entry page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ userId: 'user-a' });
    mocks.settings.mockResolvedValue({
      service: { configuration: { slug: 'service-a', displayName: 'サービスA' } },
      mode: 'DEDICATED',
      partners: [{ id: 'partner-a', name: '相棒A' }],
      available: true,
      connected: false,
      consented: true,
    });
  });
  it('offers a direct connection link for an unconnected participant', async () => {
    const html = await render();
    expect(html).toContain('LINE接続は未完了です');
    expect(html).toContain('LINEへ接続する');
    expect(html).toContain('/s/service-a/bunshins/partner-a/line');
  });
  it('explains partner creation when there are no partners', async () => {
    const settings = await mocks.settings();
    mocks.settings.mockResolvedValue({ ...settings, partners: [] });
    expect(await render()).toContain('投稿パートナーを作る');
  });
  it('shows all owned partners without silently selecting one', async () => {
    const settings = await mocks.settings();
    mocks.settings.mockResolvedValue({
      ...settings,
      partners: [...settings.partners, { id: 'partner-b', name: '相棒B' }],
    });
    const html = await render();
    expect(html).toContain('相棒A');
    expect(html).toContain('相棒B');
    expect(html).toContain('/s/service-a/bunshins/partner-b/line');
  });
  it('does not offer a broken connection link while service delivery is unavailable', async () => {
    const settings = await mocks.settings();
    mocks.settings.mockResolvedValue({ ...settings, available: false });
    const html = await render();
    expect(html).toContain('運営者へお問い合わせください');
    expect(html).not.toContain('/bunshins/partner-a/line');
  });
  it('preserves the destination for login and does not load member data', async () => {
    mocks.actor.mockResolvedValue(null);
    await expect(render()).rejects.toThrow('REDIRECT:/login?returnTo=%2Fs%2Fservice-a%2Fline');
    expect(mocks.settings).not.toHaveBeenCalled();
  });
  it('offers explicit learner consent without a posting partner', async () => {
    mocks.settings.mockResolvedValue({
      ...(await mocks.settings()),
      learningService: true,
      partners: [],
    });
    const html = await render();
    expect(html).toContain('学習用LINEの接続');
    expect(html).toContain('name="linkTarget" value="LEARNING_MEMBER"');
    expect(html).toContain('name="consent"');
    expect(html).not.toContain('name="bunshinId"');
    expect(html).not.toContain('投稿パートナーを作る');
    expect(html).not.toContain('動画');
    expect(html).toContain('学習への参加や通知配信は開始しません');
  });
  it.each(['available', 'consented'])(
    'does not offer the learner OAuth form without %s',
    async (field) => {
      mocks.settings.mockResolvedValue({
        ...(await mocks.settings()),
        learningService: true,
        [field]: false,
      });
      expect(await render()).not.toContain('name="linkTarget"');
    },
  );
});
