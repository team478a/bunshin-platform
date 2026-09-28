import { describe, expect, it, vi } from 'vitest';
import { ExaTrendResearchAdapter } from '../src/providers/exa-trend-research';
import { FirecrawlTrendResearchAdapter } from '../src/providers/firecrawl-trend-research';
import { GrokXTrendResearchAdapter } from '../src/providers/grok-x-trend-research';
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

  it('Grok X Searchの引用を共通の根拠形式へ変換する', async () => {
    let sentRequest: RequestInit | undefined;
    const fetch = vi.fn((_url: string | URL | Request, request?: RequestInit) => {
      sentRequest = request;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            output_text: '短時間で同じ形式の投稿が増えています。未来の成果は保証できません。',
            citations: ['https://x.com/example/status/123'],
            usage: { server_side_tool_usage: { SERVER_SIDE_TOOL_X_SEARCH: 1 } },
          }),
        ),
      );
    });
    const result = await new GrokXTrendResearchAdapter({
      apiKey: 'xai-secret',
      model: 'grok-4.6',
      fetch,
    }).search(query);
    expect(result).toMatchObject({
      providerKey: 'GROK_X_SEARCH',
      creditsUsed: 1,
      items: [{ url: 'https://x.com/example/status/123' }],
    });
    expect(JSON.parse(sentRequest?.body as string)).toMatchObject({
      model: 'grok-4.6',
      max_turns: 2,
      tools: [{ type: 'x_search', from_date: '2026-08-01' }],
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

  it('Grok RESTの引用annotationを安全な根拠へ変換し、重複除去後に上限を適用する', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      const adapter = new GrokXTrendResearchAdapter({
        apiKey: 'test-secret',
        model: 'grok-4.6',
        fetch: vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              status: 'completed',
              citations: ['http://unsafe.example', 'https://x.com/example/status/1'],
              output: [
                {
                  type: 'message',
                  content: [
                    {
                      type: 'output_text',
                      text: '根拠に基づいた短い概要',
                      annotations: [
                        { type: 'url_citation', url: 'https://x.com/example/status/1' },
                        { type: 'url_citation', url: 'https://x.com/example/status/2' },
                        { type: 'other', url: 'https://x.com/example/status/3' },
                      ],
                    },
                  ],
                },
              ],
              usage: { server_side_tool_usage_details: { x_search_calls: 2 } },
            }),
          ),
        ),
      });
      const result = await adapter.search({ ...query, maximumResults: 2 });
      expect(result.items.map((item) => item.url)).toEqual([
        'https://x.com/example/status/1',
        'https://x.com/example/status/2',
      ]);
      expect(result.creditsUsed).toBe(2);
      expect(timeout).toHaveBeenCalledWith(60_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it.each([
    null,
    [],
    { output: {} },
    { output_text: ' ', citations: ['https://x.com/a'] },
    { output_text: '概要', citations: [] },
    { status: 'incomplete', output_text: '途中の概要', citations: ['https://x.com/a'] },
  ])('Grokの不正・空・不完全な応答を安全に分類する: %j', async (response) => {
    const adapter = new GrokXTrendResearchAdapter({
      apiKey: 'test-secret',
      model: 'grok-4.6',
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(response))),
    });
    await expect(adapter.search(query)).rejects.toMatchObject({
      category: 'INVALID_RESPONSE',
      retryable: false,
    });
  });

  it('Grokの本文読み取り中のtimeoutも再試行可能にする', async () => {
    const response = new Response('{}');
    vi.spyOn(response, 'json').mockRejectedValue(new DOMException('private body', 'AbortError'));
    const adapter = new GrokXTrendResearchAdapter({
      apiKey: 'test-secret',
      model: 'grok-4.6',
      fetch: vi.fn().mockResolvedValue(response),
    });
    await expect(adapter.search(query)).rejects.toMatchObject({
      category: 'TIMEOUT_OR_NETWORK',
      retryable: true,
    });
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
