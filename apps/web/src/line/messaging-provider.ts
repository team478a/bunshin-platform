import 'server-only';
import {
  normalizeLineMissionNotificationSummary,
  type LineMessagingProviderPort,
  type LineMissionNotificationSummary,
  type LineProviderFailure,
} from '@bunshin/application';

const endpoint = 'https://api.line.me';

function httpFailure(status: number): LineProviderFailure {
  if (status === 401 || status === 403)
    return { ok: false, category: 'CREDENTIAL_INVALID', retryable: false };
  if (status === 429) return { ok: false, category: 'RATE_LIMITED', retryable: true };
  if (status === 400) return { ok: false, category: 'INVALID_RECIPIENT', retryable: false };
  return { ok: false, category: 'PROVIDER_UNAVAILABLE', retryable: status >= 500 };
}

function networkFailure(error: unknown): LineProviderFailure {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError'
    ? { ok: false, category: 'TIMEOUT', retryable: true }
    : { ok: false, category: 'PROVIDER_UNAVAILABLE', retryable: true };
}

export class LineMessagingApiAdapter implements LineMessagingProviderPort {
  constructor(private readonly request: typeof fetch = fetch) {}

  async getQuota(accessToken: string) {
    if (!accessToken.trim()) return httpFailure(401);
    try {
      const headers = { authorization: `Bearer ${accessToken}` };
      const [quotaResponse, consumptionResponse] = await Promise.all([
        this.request(`${endpoint}/v2/bot/message/quota`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        }),
        this.request(`${endpoint}/v2/bot/message/quota/consumption`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        }),
      ]);
      if (!quotaResponse.ok) return httpFailure(quotaResponse.status);
      if (!consumptionResponse.ok) return httpFailure(consumptionResponse.status);
      const quota = (await quotaResponse.json()) as { type?: unknown; value?: unknown };
      const consumption = (await consumptionResponse.json()) as { totalUsage?: unknown };
      const limit = quota.type === 'none' ? null : quota.value;
      if (
        (limit !== null && (!Number.isInteger(limit) || Number(limit) < 1)) ||
        !Number.isInteger(consumption.totalUsage) ||
        Number(consumption.totalUsage) < 0
      )
        return { ok: false, category: 'PROVIDER_UNAVAILABLE', retryable: true } as const;
      return {
        ok: true,
        limit: limit as number | null,
        consumption: consumption.totalUsage as number,
      } as const;
    } catch (error) {
      return networkFailure(error);
    }
  }

  async pushMissionNotification(input: {
    accessToken: string;
    recipientId: string;
    deepLinkUrl: string;
    summary: LineMissionNotificationSummary;
  }) {
    if (!input.accessToken.trim()) return httpFailure(401);
    if (!input.recipientId.trim()) return httpFailure(400);
    const summary = normalizeLineMissionNotificationSummary(input.summary);
    const platform = {
      INSTAGRAM: 'インスタグラム',
      TIKTOK: 'ティックトック',
      X: 'X',
      THREADS: 'スレッズ',
      YOUTUBE_SHORTS: 'YouTubeショート',
      OTHER: 'SNS',
    }[summary.platform];
    const format = {
      TEXT: '文章の投稿',
      SLIDE: 'スライド投稿',
      LIVE_ACTION: '撮影する動画',
      AI_VIDEO_PROMPT: 'AIで作る動画',
      IMAGE: '画像投稿',
    }[summary.format];
    try {
      const response = await this.request(`${endpoint}/v2/bot/message/push`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          to: input.recipientId,
          messages: [
            {
              type: 'text',
              text: [
                '今日やることができました。',
                `SNS：${platform}`,
                `作るもの：${format}`,
                `目安：${summary.estimatedMinutes}分`,
                `テーマ：${summary.topic}`,
                ...(summary.campaign
                  ? [
                      `公式企画：${summary.campaign.name}`,
                      summary.campaign.classification === 'ADVERTISEMENT'
                        ? '商品紹介の投稿です。内容を確認してから使ってください。'
                        : '商品に関係する企画です。内容を確認してから使ってください。',
                    ]
                  : []),
                ...(summary.researched ? ['新しい情報も参考にした企画です。'] : []),
                '',
                'くわしく見る',
                input.deepLinkUrl,
              ].join('\n'),
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return httpFailure(response.status);
      return { ok: true } as const;
    } catch (error) {
      return networkFailure(error);
    }
  }
}
