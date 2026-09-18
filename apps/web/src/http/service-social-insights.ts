import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { recordAiUsageSafely } from '../observability/ai-usage';
import {
  OpenAiSocialInsightExtractor,
  SOCIAL_INSIGHT_EXTRACTION_PROMPT_VERSION,
  SocialInsightExtractionError,
} from '../providers/openai-social-insight-extractor';
import { resolvePublicServiceContext } from '../services/public-service';
import { readServiceOnboardingSettings } from '../services/service-onboarding-settings';
import { SOCIAL_INSIGHT_METRIC_KEYS } from '../services/social-insights';
import { POST_PERFORMANCE_METRIC_KEYS, writePostPerformance } from '../services/post-performance';

const uuid = z.string().uuid();
const imageSchema = z
  .object({
    image: z.string().max(4_000_000),
    idempotencyKey: uuid,
    mode: z.enum(['ACCOUNT', 'POST']).default('ACCOUNT'),
  })
  .strict();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableMetric = z.number().int().min(0).max(2_000_000_000).nullable();
const saveSchema = z
  .object({
    socialProfileId: uuid,
    observedOn: date,
    periodStart: date.nullable(),
    periodEnd: date.nullable(),
    followers: nullableMetric,
    reach: nullableMetric,
    impressions: nullableMetric,
    profileViews: nullableMetric,
    interactions: nullableMetric,
    source: z.enum(['SCREENSHOT', 'MANUAL']),
  })
  .strict();
const savePostPerformanceSchema = z
  .object({
    dailyMissionId: uuid,
    observedOn: date,
    reach: nullableMetric,
    impressions: nullableMetric,
    likes: nullableMetric,
    comments: nullableMetric,
    saves: nullableMetric,
    shares: nullableMetric,
    profileViews: nullableMetric,
    follows: nullableMetric,
    source: z.enum(['SCREENSHOT', 'MANUAL']),
  })
  .strict();

async function json(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function respond(request: Request, operation: (requestId: string) => Promise<unknown>) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(requestId), requestId },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

async function resolveScope(serviceSlug: string, bunshinId: string) {
  const [service, actor] = await Promise.all([
    resolvePublicServiceContext(serviceSlug),
    (await currentUserProvider()).getCurrentUser(),
  ]);
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const onboarding = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  if (!onboarding.businessProfileEnabled)
    throw new ApplicationError('FORBIDDEN', 'social insight recording is not enabled');
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      status: 'ACTIVE',
      consentedAt: { not: null },
    },
    select: { id: true },
  });
  const bunshin = await db.prisma.bunshin.findFirst({
    where: {
      id: bunshinId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: actor.userId,
      status: { not: 'ARCHIVED' },
    },
    select: { id: true },
  });
  if (!membership || !bunshin) throw new ApplicationError('NOT_FOUND', 'resource not found');
  return {
    db,
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    groupMembershipId: membership.id,
    userId: actor.userId,
    bunshinId,
  };
}

function decodeImage(value: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new ApplicationError('VALIDATION_ERROR', 'invalid image');
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length < 100 || bytes.length > 3_000_000)
    throw new ApplicationError('VALIDATION_ERROR', 'image size is invalid');
  return { bytes, mimeType: match[1] as 'image/png' | 'image/jpeg' | 'image/webp' };
}

const iso = (value: Date) => value.toISOString().slice(0, 10);

export function extractServiceSocialInsightResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = imageSchema.safeParse(await json(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const scope = await resolveScope(serviceSlug, bunshinId);
    const image = decodeImage(parsed.data.image);
    const runtime = await resolveOpenAiRuntimeConfiguration();
    const started = Date.now();
    try {
      const result = await new OpenAiSocialInsightExtractor({
        apiKey: runtime.apiKey,
        model: runtime.model,
      }).extract({ ...image, mode: parsed.data.mode });
      await recordAiUsageSafely({
        workspaceId: scope.workspaceId,
        bunshinId: scope.bunshinId,
        actorUserId: scope.userId,
        taskType: 'SOCIAL_INSIGHT_EXTRACTION',
        provider: 'OPENAI',
        model: result.model,
        promptVersion: result.promptVersion,
        status: 'SUCCESS',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        estimatedCostUsdMicros: runtime.requestCostUsdMicros || null,
        pricingVersion: runtime.requestCostUsdMicros ? 'admin-request-cost-v1' : null,
        idempotencyKey: `social-insight:${parsed.data.idempotencyKey}`,
      });
      return result.extraction;
    } catch (error) {
      await recordAiUsageSafely({
        workspaceId: scope.workspaceId,
        bunshinId: scope.bunshinId,
        actorUserId: scope.userId,
        taskType: 'SOCIAL_INSIGHT_EXTRACTION',
        provider: 'OPENAI',
        model: runtime.model,
        promptVersion: SOCIAL_INSIGHT_EXTRACTION_PROMPT_VERSION,
        status: 'FAILED',
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - started,
        estimatedCostUsdMicros: runtime.requestCostUsdMicros || null,
        pricingVersion: runtime.requestCostUsdMicros ? 'admin-request-cost-v1' : null,
        errorCode:
          error instanceof SocialInsightExtractionError ? error.category : 'UNEXPECTED_ERROR',
        idempotencyKey: `social-insight:${parsed.data.idempotencyKey}`,
      });
      if (error instanceof SocialInsightExtractionError)
        throw new ApplicationError(
          error.retryable ? 'AI_PROVIDER_UNAVAILABLE' : 'CONTENT_REJECTED',
          'SNSの数字を読み取れませんでした',
          error,
        );
      throw error;
    }
  });
}

export function saveServicePostPerformanceResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = savePostPerformanceSchema.safeParse(await json(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    if (POST_PERFORMANCE_METRIC_KEYS.every((key) => parsed.data[key] === null))
      throw new ApplicationError('VALIDATION_ERROR', 'at least one metric is required');
    const scope = await resolveScope(serviceSlug, bunshinId);
    const mission = await scope.db.prisma.dailyMission.findFirst({
      where: {
        id: parsed.data.dailyMissionId,
        workspaceId: scope.workspaceId,
        bunshinId: scope.bunshinId,
        bunshin: { ownerUserId: scope.userId, groupId: scope.groupId },
      },
      select: {
        id: true,
        topic: true,
        postRecord: {
          select: { id: true, actorUserId: true, postedAt: true, manualMetrics: true },
        },
      },
    });
    const post = mission?.postRecord;
    if (!mission || !post || post.actorUserId !== scope.userId)
      throw new ApplicationError('NOT_FOUND', 'posted mission not found');
    const performance = {
      observedOn: parsed.data.observedOn,
      source: parsed.data.source,
      ...Object.fromEntries(POST_PERFORMANCE_METRIC_KEYS.map((key) => [key, parsed.data[key]])),
    } as Parameters<typeof writePostPerformance>[1];
    await scope.db.prisma.postRecord.update({
      where: { id: post.id },
      data: { manualMetrics: writePostPerformance(post.manualMetrics, performance) },
    });
    return {
      dailyMissionId: mission.id,
      topic: mission.topic,
      postedAt: post.postedAt.toISOString(),
      ...performance,
    };
  });
}

export function saveServiceSocialInsightResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = saveSchema.safeParse(await json(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    if (SOCIAL_INSIGHT_METRIC_KEYS.every((key) => parsed.data[key] === null))
      throw new ApplicationError('VALIDATION_ERROR', 'at least one metric is required');
    if (
      parsed.data.periodStart &&
      parsed.data.periodEnd &&
      parsed.data.periodStart > parsed.data.periodEnd
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid period');
    const scope = await resolveScope(serviceSlug, bunshinId);
    const profile = await scope.db.prisma.socialProfile.findFirst({
      where: {
        id: parsed.data.socialProfileId,
        workspaceId: scope.workspaceId,
        bunshinId: scope.bunshinId,
        status: 'ACTIVE',
      },
      select: { id: true, platform: true },
    });
    if (!profile) throw new ApplicationError('NOT_FOUND', 'social profile not found');
    const observedOn = new Date(`${parsed.data.observedOn}T00:00:00.000Z`);
    if (Number.isNaN(observedOn.valueOf()) || iso(observedOn) !== parsed.data.observedOn)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid observed date');
    const row = await scope.db.prisma.socialInsightSnapshot.upsert({
      where: {
        workspaceId_bunshinId_socialProfileId_observedOn: {
          workspaceId: scope.workspaceId,
          bunshinId: scope.bunshinId,
          socialProfileId: profile.id,
          observedOn,
        },
      },
      create: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        groupMembershipId: scope.groupMembershipId,
        userId: scope.userId,
        bunshinId: scope.bunshinId,
        socialProfileId: profile.id,
        platform: profile.platform,
        observedOn,
        periodStart: parsed.data.periodStart
          ? new Date(`${parsed.data.periodStart}T00:00:00.000Z`)
          : null,
        periodEnd: parsed.data.periodEnd
          ? new Date(`${parsed.data.periodEnd}T00:00:00.000Z`)
          : null,
        followers: parsed.data.followers,
        reach: parsed.data.reach,
        impressions: parsed.data.impressions,
        profileViews: parsed.data.profileViews,
        interactions: parsed.data.interactions,
        source: parsed.data.source,
      },
      update: {
        periodStart: parsed.data.periodStart
          ? new Date(`${parsed.data.periodStart}T00:00:00.000Z`)
          : null,
        periodEnd: parsed.data.periodEnd
          ? new Date(`${parsed.data.periodEnd}T00:00:00.000Z`)
          : null,
        followers: parsed.data.followers,
        reach: parsed.data.reach,
        impressions: parsed.data.impressions,
        profileViews: parsed.data.profileViews,
        interactions: parsed.data.interactions,
        source: parsed.data.source,
      },
    });
    return {
      id: row.id,
      socialProfileId: row.socialProfileId,
      platform: row.platform,
      observedOn: iso(row.observedOn),
      periodStart: row.periodStart ? iso(row.periodStart) : null,
      periodEnd: row.periodEnd ? iso(row.periodEnd) : null,
      followers: row.followers,
      reach: row.reach,
      impressions: row.impressions,
      profileViews: row.profileViews,
      interactions: row.interactions,
      source: row.source,
    };
  });
}
