import 'server-only';
import type { TrendResearchProviderPort } from '@bunshin/capability-social';
import {
  classifyTrendProviderStatus,
  safeTrendResult,
  TrendSearchProviderError,
} from './trend-research-provider';

type FirecrawlResponse = {
  success?: boolean;
  data?: {
    web?: Array<{ url?: unknown; title?: unknown; description?: unknown; markdown?: unknown }>;
  };
  creditsUsed?: unknown;
};

export class FirecrawlTrendResearchAdapter implements TrendResearchProviderPort {
  constructor(
    private readonly options: { apiKey: string; fetch?: typeof fetch; timeoutMs?: number },
  ) {}

  async search(input: Parameters<TrendResearchProviderPort['search']>[0]) {
    const started = Date.now();
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)('https://api.firecrawl.dev/v2/search', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
        body: JSON.stringify({
          query: input.query,
          limit: Math.min(Math.max(input.maximumResults, 1), 10),
          sources: ['web'],
          country: input.country,
          tbs: `qdr:d${Math.max(1, Math.ceil((Date.now() - input.publishedAfter.valueOf()) / 86_400_000))}`,
          scrapeOptions: { formats: [{ type: 'markdown' }] },
        }),
      });
    } catch {
      throw new TrendSearchProviderError('TIMEOUT_OR_NETWORK', true);
    }
    if (!response.ok) throw classifyTrendProviderStatus(response.status);
    let value: FirecrawlResponse;
    try {
      value = (await response.json()) as FirecrawlResponse;
    } catch {
      throw new TrendSearchProviderError('INVALID_RESPONSE', false, response.status);
    }
    if (value.success !== true || !Array.isArray(value.data?.web))
      throw new TrendSearchProviderError('INVALID_RESPONSE', false, response.status);
    const items = value.data.web
      .map((item) =>
        safeTrendResult({
          url: item.url,
          title: item.title,
          highlights: [item.description, item.markdown],
        }),
      )
      .filter((item): item is NonNullable<typeof item> => item !== null);
    return {
      providerKey: 'FIRECRAWL',
      items,
      creditsUsed: typeof value.creditsUsed === 'number' ? value.creditsUsed : null,
      latencyMs: Date.now() - started,
    };
  }
}
