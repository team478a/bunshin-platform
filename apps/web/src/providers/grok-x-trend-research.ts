import 'server-only';
import type { TrendResearchProviderPort } from '@bunshin/capability-social';
import {
  classifyTrendProviderStatus,
  safeTrendResult,
  TrendSearchProviderError,
} from './trend-research-provider';

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export class GrokXTrendResearchAdapter implements TrendResearchProviderPort {
  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      fetch?: typeof fetch;
      timeoutMs?: number;
    },
  ) {}

  async search(input: Parameters<TrendResearchProviderPort['search']>[0]) {
    const started = Date.now();
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 60_000),
        body: JSON.stringify({
          model: this.options.model,
          input: `次のテーマについて、Xで注目が上がっている具体的な投稿や会話を調べてください。テーマ: ${input.query}。言語: ${input.language}。国: ${input.country}。断定や未来予知は避け、観測できる兆候だけを簡潔に要約してください。`,
          tools: [
            {
              type: 'x_search',
              from_date: input.publishedAfter.toISOString().slice(0, 10),
              to_date: new Date().toISOString().slice(0, 10),
            },
          ],
          max_turns: 2,
        }),
      });
    } catch {
      throw new TrendSearchProviderError('TIMEOUT_OR_NETWORK', true);
    }
    if (!response.ok) throw classifyTrendProviderStatus(response.status);
    let value: Record<string, unknown> | null;
    try {
      value = record(await response.json());
    } catch (error) {
      if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
        throw new TrendSearchProviderError('TIMEOUT_OR_NETWORK', true);
      throw new TrendSearchProviderError('INVALID_RESPONSE', false, response.status);
    }
    if (!value || (value.status !== undefined && value.status !== 'completed'))
      throw new TrendSearchProviderError('INVALID_RESPONSE', false, response.status);
    const content = array(value.output)
      .flatMap((item) => array(record(item)?.content))
      .map(record)
      .filter((item) => item?.type === 'output_text');
    const outputText =
      typeof value.output_text === 'string'
        ? value.output_text
        : content.map((item) => (typeof item?.text === 'string' ? item.text : '')).join('\n');
    const summary = outputText.trim().slice(0, 1200);
    // REST Responses citations may be attached to output_text rather than the SDK convenience field.
    const citations = [
      ...array(value.citations),
      ...content.flatMap((item) =>
        array(item?.annotations).flatMap((annotation) => {
          const citation = record(annotation);
          return citation?.type === 'url_citation' ? [citation.url] : [];
        }),
      ),
    ];
    const items = citations
      .map((url, index) =>
        safeTrendResult({
          url,
          title: `Xで確認した話題 ${index + 1}`,
          highlights: [summary],
        }),
      )
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .filter(
        (item, index, values) => values.findIndex((other) => other.url === item.url) === index,
      )
      .slice(0, Math.min(Math.max(input.maximumResults, 1), 10));
    if (items.length === 0)
      throw new TrendSearchProviderError('INVALID_RESPONSE', false, response.status);
    const usage = record(value.usage);
    const calls =
      record(usage?.server_side_tool_usage_details)?.x_search_calls ??
      record(usage?.server_side_tool_usage)?.['SERVER_SIDE_TOOL_X_SEARCH'];
    return {
      providerKey: 'GROK_X_SEARCH',
      items,
      creditsUsed: typeof calls === 'number' && Number.isFinite(calls) && calls >= 0 ? calls : null,
      latencyMs: Date.now() - started,
    };
  }
}
