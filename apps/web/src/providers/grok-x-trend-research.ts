import 'server-only';
import type { TrendResearchProviderPort } from '@bunshin/capability-social';
import {
  classifyTrendProviderStatus,
  safeTrendResult,
  TrendSearchProviderError,
} from './trend-research-provider';

type GrokResponse = {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ text?: unknown }> }>;
  citations?: unknown;
  usage?: { server_side_tool_usage?: Record<string, unknown> };
};

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
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
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
          max_turns: 3,
        }),
      });
    } catch {
      throw new TrendSearchProviderError('TIMEOUT_OR_NETWORK', true);
    }
    if (!response.ok) throw classifyTrendProviderStatus(response.status);
    let value: GrokResponse;
    try {
      value = (await response.json()) as GrokResponse;
    } catch {
      throw new TrendSearchProviderError('INVALID_RESPONSE', false, response.status);
    }
    const outputText =
      typeof value.output_text === 'string'
        ? value.output_text
        : value.output
            ?.flatMap((item) => item.content ?? [])
            .map((item) => item.text)
            .find((item): item is string => typeof item === 'string');
    if (typeof outputText !== 'string' || !Array.isArray(value.citations))
      throw new TrendSearchProviderError('INVALID_RESPONSE', false, response.status);
    const summary = outputText.trim().slice(0, 1200);
    const items = value.citations
      .slice(0, Math.min(Math.max(input.maximumResults, 1), 10))
      .map((url, index) =>
        safeTrendResult({
          url,
          title: `Xで確認した話題 ${index + 1}`,
          highlights: [summary],
        }),
      )
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (items.length === 0)
      throw new TrendSearchProviderError('INVALID_RESPONSE', false, response.status);
    const calls = value.usage?.server_side_tool_usage?.['SERVER_SIDE_TOOL_X_SEARCH'];
    return {
      providerKey: 'GROK_X_SEARCH',
      items,
      creditsUsed: typeof calls === 'number' ? calls : null,
      latencyMs: Date.now() - started,
    };
  }
}
