import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import { serviceAuthMetadata } from '../src/services/service-auth-metadata';

type ServiceLookup = (slug: string) => Promise<{
  configuration: {
    displayName: string;
    brand: { logoUrl: null };
    poweredByEnabled: boolean;
  };
}>;

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn<ServiceLookup>() }));
vi.mock('../src/services/public-service', () => ({ resolvePublicServiceContext: lookup }));

describe('service auth metadata', () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it('keeps service titles separate and uses configured names', async () => {
    lookup.mockImplementation((slug: string) =>
      Promise.resolve({
        configuration: {
          displayName: slug === 'hassy' ? 'ハッシー' : 'マナベルスタイル',
          brand: { logoUrl: null },
          poweredByEnabled: true,
        },
      }),
    );
    expect(await serviceAuthMetadata('/s/hassy', 'ログイン')).toEqual({
      title: 'ハッシー｜ログイン',
    });
    expect(await serviceAuthMetadata('/s/manaberu-style', 'ログインを確認')).toEqual({
      title: 'マナベルスタイル｜ログインを確認',
    });
    expect(await serviceAuthMetadata('/s/hassy/onboarding', '最初のかんたん設定')).toEqual({
      title: 'ハッシー｜最初のかんたん設定',
    });
    expect(lookup.mock.calls.map(([slug]) => slug)).toEqual(['hassy', 'manaberu-style', 'hassy']);
  });

  it('does not resolve untrusted external destinations', async () => {
    expect(await serviceAuthMetadata('https://evil.example/s/hassy', 'ログイン')).toEqual({
      title: 'ワタシワークス｜ログイン',
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('uses the existing approved brand fallback when public context is unavailable', async () => {
    lookup.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service not found'));
    expect(await serviceAuthMetadata('/s/hassy', 'ログイン')).toEqual({
      title: 'ハッシー｜ログイン',
    });
  });

  it('does not hide infrastructure failures', async () => {
    lookup.mockRejectedValue(new Error('database unavailable'));
    await expect(serviceAuthMetadata('/s/hassy', 'ログイン')).rejects.toThrow(
      'database unavailable',
    );
  });
});
