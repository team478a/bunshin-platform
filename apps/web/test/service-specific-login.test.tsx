import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  service: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock('../src/services/public-service', () => ({
  resolvePublicServiceContext: mocks.service,
}));

import LoginPage from '../app/login/page';
import ServiceLoginPage from '../app/s/[serviceSlug]/login/page';

describe('service-specific login entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.service.mockImplementation((slug: string) =>
      Promise.resolve({
        configuration: {
          displayName: slug === 'hassy' ? 'ハッシー' : 'マナベルスタイル',
          brand: { logoUrl: null },
          poweredByEnabled: true,
        },
      }),
    );
  });

  it('moves legacy service login links onto the service-owned URL', async () => {
    const returnTo = '/s/manaberu-style/home';
    await expect(
      LoginPage({ searchParams: Promise.resolve({ returnTo, sent: '1' }) }),
    ).rejects.toThrow(
      `REDIRECT:/s/manaberu-style/login?returnTo=${encodeURIComponent(returnTo)}&sent=1`,
    );
  });

  it('keeps a mismatched return path out of another service login', async () => {
    const html = renderToStaticMarkup(
      await ServiceLoginPage({
        params: Promise.resolve({ serviceSlug: 'manaberu-style' }),
        searchParams: Promise.resolve({ returnTo: '/s/hassy/home' }),
      }),
    );

    expect(html).toContain('マナベルスタイルへログイン');
    expect(html).toContain('name="returnTo" value="/s/manaberu-style"');
    expect(html).not.toContain('/s/hassy/home');
  });

  it('renders each service login with only that service branding', async () => {
    const html = renderToStaticMarkup(
      await ServiceLoginPage({
        params: Promise.resolve({ serviceSlug: 'hassy' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain('ハッシーへログイン');
    expect(html).toContain('name="returnTo" value="/s/hassy"');
    expect(html).not.toContain('マナベルスタイル');
  });

  it('does not expose the shared login from the platform top or 404 page', () => {
    const home = readFileSync(new URL('../app/(public)/page.tsx', import.meta.url), 'utf8');
    const notFound = readFileSync(new URL('../app/not-found.tsx', import.meta.url), 'utf8');

    expect(home).not.toContain('href="/login"');
    expect(notFound).not.toContain('href="/login"');
  });
});
