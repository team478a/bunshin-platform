import 'server-only';
import { ExpireTrendResearchData } from '@bunshin/application';
import type {
  SocialPlatform,
  SocialPreferredFormat,
  TrendResearchProviderPort,
  TrendSearchResultItem,
} from '@bunshin/capability-social';
import { CreateCompletedTrendResearch } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { createHash } from 'node:crypto';
import { resolveTrendRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { ExaTrendResearchAdapter } from '../providers/exa-trend-research';
import { FirecrawlTrendResearchAdapter } from '../providers/firecrawl-trend-research';
import { GrokXTrendResearchAdapter } from '../providers/grok-x-trend-research';
import { TrendSearchProviderError } from '../providers/trend-research-provider';

const DAY = 86_400_000;

const allowedFormats: Record<SocialPlatform, SocialPreferredFormat[]> = {
  X: ['TEXT'],
  THREADS: ['TEXT'],
  INSTAGRAM: ['SLIDE', 'IMAGE', 'LIVE_ACTION', 'AI_VIDEO_PROMPT'],
  TIKTOK: ['LIVE_ACTION', 'AI_VIDEO_PROMPT'],
  YOUTUBE_SHORTS: ['LIVE_ACTION', 'AI_VIDEO_PROMPT'],
  OTHER: ['TEXT', 'SLIDE', 'IMAGE', 'LIVE_ACTION', 'AI_VIDEO_PROMPT'],
};

const formatFor = (platform: SocialPlatform, preferred: SocialPreferredFormat[]) =>
  preferred.find((value) => allowedFormats[platform].includes(value)) ??
  allowedFormats[platform][0]!;

const date = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (value: Date, days: number) => new Date(value.getTime() + days * DAY);
const clean = (value: string, maximum: number) =>
  value.replace(/\s+/g, ' ').trim().slice(0, maximum);

function providerFor(configuration: Awaited<ReturnType<typeof resolveTrendRuntimeConfiguration>>) {
  if (configuration.provider === 'GROK')
    return new GrokXTrendResearchAdapter({
      apiKey: configuration.apiKey,
      model: configuration.model ?? 'grok-4.6',
    });
  if (configuration.provider === 'EXA')
    return new ExaTrendResearchAdapter({ apiKey: configuration.apiKey });
  return new FirecrawlTrendResearchAdapter({ apiKey: configuration.apiKey });
}

const evidenceItem = (item: TrendSearchResultItem, index: number, now: Date, expiresAt: Date) => {
  const summary = clean(item.highlights.join(' '), 2_000);
  return {
    key: `source-${index + 1}`,
    sourceType: 'PUBLIC_WEB' as const,
    sourceUrl: item.url,
    sourceTitle: clean(item.title, 500),
    publishedAt: item.publishedAt,
    retrievedAt: now,
    summary: summary || clean(item.title, 2_000),
    evidenceHash: createHash('sha256')
      .update(`${item.url}\n${item.title}\n${summary}`)
      .digest('hex'),
    expiresAt,
  };
};

export class WeeklyTrendResearchGenerationService {
  async execute(input: {
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    socialProfileId: string;
    periodStart: string;
    usageIdempotencyKey: string;
  }) {
    const db = await import('@bunshin/database');
    const started = Date.now();
    let providerKey = 'trend-search';
    let model = 'search';
    let requestCostUsdMicros: number | null = null;
    try {
      const context = await new db.PrismaTrendResearchGenerationContextRepository().get(input);
      if (!context) throw new ApplicationError('NOT_FOUND', 'trend generation scope not found');
      const periodStart = new Date(`${input.periodStart}T00:00:00.000Z`);
      if (Number.isNaN(periodStart.valueOf()) || periodStart.getUTCDay() !== 1)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid trend period');
      await new ExpireTrendResearchData(new db.PrismaTrendResearchExpiryRepository()).execute({
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
        at: periodStart,
      });
      const configuration = await resolveTrendRuntimeConfiguration();
      providerKey = configuration.provider.toLowerCase();
      model = configuration.model ?? `${providerKey}-search`;
      requestCostUsdMicros = configuration.requestCostUsdMicros || null;
      const provider: TrendResearchProviderPort = providerFor(configuration);
      const query = clean(
        [context.purpose, context.concept, context.targetSummary, ...context.contentPillars].join(
          ' ',
        ),
        500,
      );
      const result = await provider.search({
        query,
        language: 'ja',
        country: 'JP',
        publishedAfter: addDays(periodStart, -7),
        maximumResults: 6,
      });
      if (result.items.length === 0) throw new TrendSearchProviderError('INVALID_RESPONSE', false);
      const completedAt = new Date();
      const expiresAt = addDays(periodStart, 14);
      const evidence = result.items
        .slice(0, 6)
        .map((item, index) => evidenceItem(item, index, completedAt, expiresAt));
      const suggestedFormat = formatFor(context.platform, context.preferredFormats);
      const candidates = result.items.slice(0, 3).map((item, index) => {
        const source = evidence[index]!;
        const age = item.publishedAt
          ? Math.max(0, Math.floor((completedAt.getTime() - item.publishedAt.getTime()) / DAY))
          : 7;
        return {
          platform: context.platform,
          topic: clean(item.title, 200),
          hook: clean(item.highlights[0] ?? item.title, 500),
          whyNow: clean(`直近の公開情報「${item.title}」を根拠にした話題です。`, 1_000),
          fitReason: clean(
            `${context.targetSummary}に向けた${context.purpose}の発信に関連します。`,
            1_000,
          ),
          suggestedFormat,
          estimatedMinutes: suggestedFormat === 'TEXT' ? 5 : 10,
          freshnessScore: Math.max(40, 100 - age * 8),
          fitScore: Math.max(60, 90 - index * 5),
          feasibilityScore: suggestedFormat === 'TEXT' ? 95 : 80,
          safetyStatus: 'SAFE' as const,
          expiresAt,
          evidenceKeys: [source.key],
        };
      });
      try {
        await new CreateCompletedTrendResearch(
          new db.PrismaTrendResearchRepository(),
          new db.PrismaBunshinCapabilityAssignmentRepository(),
        ).execute({
          ...input,
          platform: context.platform,
          periodStart: date(periodStart),
          periodEnd: date(addDays(periodStart, 6)),
          queryVersion: 'weekly-trend-research-v1',
          providerKey: result.providerKey,
          completedAt,
          expiresAt,
          evidence,
          candidates,
        });
      } catch (error) {
        if (!(error instanceof ApplicationError && error.code === 'CONFLICT')) throw error;
      }
      await recordAiUsageSafely({
        ...input,
        taskType: 'TREND_RESEARCH',
        provider: providerKey,
        model,
        promptVersion: 'weekly-trend-research-v1',
        status: 'SUCCESS',
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - started,
        estimatedCostUsdMicros: requestCostUsdMicros,
        pricingVersion: requestCostUsdMicros === null ? null : 'admin-request-cost-v1',
        idempotencyKey: input.usageIdempotencyKey,
      });
    } catch (error) {
      await recordAiUsageSafely({
        ...input,
        taskType: 'TREND_RESEARCH',
        provider: providerKey,
        model,
        promptVersion: 'weekly-trend-research-v1',
        status: 'FAILED',
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - started,
        estimatedCostUsdMicros: requestCostUsdMicros,
        pricingVersion: requestCostUsdMicros === null ? null : 'admin-request-cost-v1',
        errorCode:
          error instanceof TrendSearchProviderError
            ? error.category
            : error instanceof ApplicationError
              ? error.code
              : 'UNEXPECTED',
        idempotencyKey: input.usageIdempotencyKey,
      });
      throw error;
    }
  }
}
