import { describe, expect, it, vi } from 'vitest';
import { ExaTrendResearchAdapter } from '../src/providers/exa-trend-research';
import { FirecrawlTrendResearchAdapter } from '../src/providers/firecrawl-trend-research';
import {
  classifyTrendProviderStatus,
  safeTrendResult,
  TrendSearchProviderError,
} from '../src/providers/trend-research-provider';

const query = {
  query: '小さなお店 動画 話題',
  language: 'ja',
  country: 'JP',
  publishedAfter: new Date('2026-08-01T00:00:00.000Z'),
  maximumResults: 3,
};

describe('trend research provider adapters', () => {
  it('Exaの応答を共通形式へ安全に変換する', async () => {
    let sentRequest: RequestInit | undefined;
    const fetch = vi.fn((_url: string | URL | Request, request?: RequestInit) => {
      sentRequest = request;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                url: 'https://example.com/story',
                title: '新しい話題',
                publishedDate: '2026-08-20T00:00:00Z',
                highlights: ['短い根拠'],
              },
            ],
          }),
        ),
      );
    });
    const result = await new ExaTrendResearchAdapter({ apiKey: 'test-secret', fetch }).search(
      query,
    );
    expect(result.providerKey).toBe('EXA');
    expect(result.items[0]).toMatchObject({
      url: 'https://example.com/story',
      title: '新しい話題',
      highlights: ['短い根拠'],
    });
    expect(typeof sentRequest?.body).toBe('string');
    expect(JSON.parse(sentRequest?.body as string)).toMatchObject({
      numResults: 3,
      startPublishedDate: '2026-08-01T00:00:00.000Z',
      moderation: true,
    });
  });

  it('Firecrawlの応答と消費creditを共通形式へ変換する', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              web: [{ url: 'https://example.jp/news', title: '今日の話題', description: '概要' }],
            },
            creditsUsed: 2,
          }),
        ),
      ),
    );
    const result = await new FirecrawlTrendResearchAdapter({
      apiKey: 'test-secret',
      fetch,
    }).search(query);
    expect(result).toMatchObject({
      providerKey: 'FIRECRAWL',
      creditsUsed: 2,
      items: [{ title: '今日の話題', highlights: ['概要'] }],
    });
  });

  it('安全でないURLと根拠のない結果を除外する', () => {
    expect(
      safeTrendResult({ url: 'http://example.com', title: '題', highlights: ['根拠'] }),
    ).toBeNull();
    expect(
      safeTrendResult({ url: 'https://user:pass@example.com', title: '題', highlights: ['根拠'] }),
    ).toBeNull();
    expect(safeTrendResult({ url: 'https://example.com', title: '題', highlights: [] })).toBeNull();
  });

  it.each([
    [401, 'AUTHENTICATION', false],
    [402, 'QUOTA', false],
    [429, 'RATE_LIMIT', true],
    [503, 'PROVIDER_ERROR', true],
  ] as const)('HTTP %sを固定分類する', (status, category, retryable) => {
    expect(classifyTrendProviderStatus(status)).toMatchObject({ category, retryable, status });
  });

  it('通信失敗と壊れた応答を区別する', async () => {
    const network = new ExaTrendResearchAdapter({
      apiKey: 'test-secret',
      fetch: vi.fn(() => Promise.reject(new Error('offline'))),
    });
    await expect(network.search(query)).rejects.toMatchObject({ category: 'TIMEOUT_OR_NETWORK' });

    const invalid = new FirecrawlTrendResearchAdapter({
      apiKey: 'test-secret',
      fetch: vi.fn(() => Promise.resolve(new Response('{', { status: 200 }))),
    });
    await expect(invalid.search(query)).rejects.toBeInstanceOf(TrendSearchProviderError);
    await expect(invalid.search(query)).rejects.toMatchObject({ category: 'INVALID_RESPONSE' });
  });
});
