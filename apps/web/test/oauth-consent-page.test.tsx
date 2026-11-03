import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const m = vi.hoisted(() => ({ load: vi.fn(), redirect: vi.fn() }));
vi.mock('../src/services/oauth-consent', () => ({ loadOAuthConsent: m.load }));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
import Page, { metadata } from '../app/oauth/consent/page';
beforeEach(() => {
  vi.resetAllMocks();
  m.redirect.mockImplementation((url: string) => {
    throw new Error(`synthetic-redirect:${url}`);
  });
});
describe('OAuth consent page', () => {
  it('preserves same-origin form Origin without sharing referrers externally', () => {
    expect(metadata.referrer).toBe('same-origin');
  });
  it('keeps the empty catalog readable without creating login or consent prompts', async () => {
    m.load.mockResolvedValue({ kind: 'unavailable' });
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ authorization_id: 'synthetic' }) }),
    );
    expect(html).toContain('外部接続は準備中');
    expect(html).not.toContain('<form');
    expect(m.redirect).not.toHaveBeenCalled();
  });
  it('preserves the request through normal login', async () => {
    m.load.mockResolvedValue({
      kind: 'login',
      returnTo: '/oauth/consent?authorization_id=synthetic',
    });
    await expect(
      Page({ searchParams: Promise.resolve({ authorization_id: 'synthetic' }) }),
    ).rejects.toThrow('synthetic-redirect:/login?returnTo=');
  });
  it('does not wrap an already-approved SDK redirect in another confirmation', async () => {
    m.load.mockResolvedValue({
      kind: 'redirect',
      url: 'https://client.example.invalid/callback?code=synthetic',
    });
    await expect(
      Page({ searchParams: Promise.resolve({ authorization_id: 'synthetic' }) }),
    ).rejects.toThrow('synthetic-redirect:https://client.example.invalid');
  });
  it('renders fixed provider errors and offers a safe retry after native POST errors', async () => {
    m.load.mockRejectedValue(new Error('private provider error'));
    const failed = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ authorization_id: 'synthetic' }) }),
    );
    expect(failed).toContain('接続を確認できませんでした');
    expect(failed).not.toContain('private provider error');
    m.load.mockClear();
    const retry = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ authorization_id: 'synthetic', error: '1' }) }),
    );
    expect(retry).toContain('もう一度確認する');
    expect(retry).toContain('/oauth/consent?authorization_id=synthetic');
    expect(m.load).not.toHaveBeenCalled();
  });
});
