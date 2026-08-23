import 'server-only';
import type { TrendResearchProviderPort } from '@bunshin/capability-social';
import {
  classifyTrendProviderStatus,
  safeTrendResult,
  TrendSearchProviderError,
} from './trend-research-provider';

type ExaResponse = {
  results?: Array<{
    url?: unknown;
    title?: unknown;
    publishedDate?: unknown;
    highlights?: unknown;
  }>;
};

export class ExaTrendResearchAdapter implements TrendResearchProviderPort {
  constructor(
    private readonly options: { apiKey: string; fetch?: typeof fetch; timeoutMs?: number },
  ) {}

  async search(input: Parameters<TrendResearchProviderPort['search']>[0]) {
    const started = Date.now();
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.options.apiKey },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
        body: JSON.stringify({
          query: `${input.query} language:${input.language} country:${input.country}`,
          type: 'fast',
          numResults: Math.min(Math.max(input.maximumResults, 1), 10),
          startPublishedDate: input.publishedAfter.toISOString(),
          moderation: true,
          contents: { highlights: { query: input.query, maxCharacters: 1200 } },
        }),
      });
    } catch {
      throw new TrendSearchProviderError('TIMEOUT_OR_NETWORK', true);
    }
    if (!response.ok) throw classifyTrendProviderStatus(response.status);
    let value: ExaResponse;
    try {
      value = (await response.json()) as ExaResponse;
    } catch {
      throw new TrendSearchProviderError('INVALID_RESPONSE', false, response.status);
    }
    if (!Array.isArray(value.results))
      throw new TrendSearchProviderError('INVALID_RESPONSE', false, response.status);
    const items = value.results
      .map((item) =>
        safeTrendResult({
          url: item.url,
          title: item.title,
          publishedAt: item.publishedDate,
          highlights: Array.isArray(item.highlights) ? item.highlights : [],
        }),
      )
      .filter((item): item is NonNullable<typeof item> => item !== null);
    return { providerKey: 'EXA', items, creditsUsed: null, latencyMs: Date.now() - started };
  }
}
