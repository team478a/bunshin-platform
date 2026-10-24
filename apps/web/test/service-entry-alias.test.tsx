import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  publicService: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('ROUTE_NOT_FOUND');
  },
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.actor }),
}));
vi.mock('../src/services/public-service', () => ({
  resolvePublicServiceContext: mocks.publicService,
}));

import ServiceEntryPage, { generateMetadata } from '../app/s/[serviceSlug]/page';

const params = (serviceSlug: string) => Promise.resolve({ serviceSlug });
const searchParams = Promise.resolve({});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue(null);
  mocks.publicService.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service not found'));
});

describe('service entry aliases', () => {
  it.each([
    ['hassy', 'ハッシー'],
    ['sennokuni-media', '千ノ国メディア'],
  ])(
    'keeps the approved %s direct URL usable when public settings are unavailable',
    async (slug, name) => {
      const html = renderToStaticMarkup(
        await ServiceEntryPage({ params: params(slug), searchParams }),
      );

      expect(html).toContain(name);
      expect(html).toContain('ログインして続ける');
      expect(html).toContain(`/login?returnTo=%2Fs%2F${slug}%2Fhome`);
      expect(html).toContain('ワタシワークスを利用しています');
    },
  );

  it('shows the unavailable-state guidance to an already signed-in user', async () => {
    mocks.actor.mockResolvedValue({ userId: 'user-a' });

    const html = renderToStaticMarkup(
      await ServiceEntryPage({ params: params('hassy'), searchParams }),
    );

    expect(html).toContain('サービスの利用状態を確認できません');
    expect(html).toContain('何度もログインし直さず');
    expect(html).not.toContain('ログインして続ける');
  });

  it('keeps unknown service slugs as 404', async () => {
    await expect(
      ServiceEntryPage({ params: params('unknown-service'), searchParams }),
    ).rejects.toThrow('ROUTE_NOT_FOUND');
  });

  it('provides metadata for an approved alias without inventing service settings', async () => {
    await expect(generateMetadata({ params: params('sennokuni-media') })).resolves.toMatchObject({
      title: '千ノ国メディア',
      description: '千ノ国メディアの利用案内',
    });
  });
});
