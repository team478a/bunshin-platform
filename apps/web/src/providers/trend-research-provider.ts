import 'server-only';
import type { TrendSearchFailureCategory, TrendSearchResultItem } from '@bunshin/capability-social';

export class TrendSearchProviderError extends Error {
  constructor(
    public readonly category: TrendSearchFailureCategory,
    public readonly retryable: boolean,
    public readonly status: number | null = null,
  ) {
    super(`trend search provider failed: ${category}`);
    this.name = 'TrendSearchProviderError';
  }
}

export function classifyTrendProviderStatus(status: number): TrendSearchProviderError {
  if (status === 401 || status === 403)
    return new TrendSearchProviderError('AUTHENTICATION', false, status);
  if (status === 429) return new TrendSearchProviderError('RATE_LIMIT', true, status);
  if (status === 402) return new TrendSearchProviderError('QUOTA', false, status);
  return new TrendSearchProviderError('PROVIDER_ERROR', status >= 500, status);
}

function string(value: unknown, maximum: number) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, maximum)
    : null;
}

export function safeTrendResult(input: {
  url: unknown;
  title: unknown;
  publishedAt?: unknown;
  highlights: unknown[];
}): TrendSearchResultItem | null {
  const title = string(input.title, 500);
  if (!title) return null;
  let url: URL;
  try {
    url = new URL(typeof input.url === 'string' ? input.url : '');
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
  const published = string(input.publishedAt, 100);
  const publishedAt = published ? new Date(published) : null;
  const highlights = input.highlights
    .map((value) => string(value, 1200))
    .filter((value): value is string => value !== null)
    .slice(0, 3);
  if (highlights.length === 0) return null;
  return {
    url: url.toString(),
    title,
    publishedAt: publishedAt && !Number.isNaN(publishedAt.valueOf()) ? publishedAt : null,
    highlights,
  };
}
