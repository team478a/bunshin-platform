import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { currentAiProviderEnvironment } from '../ai/secure-provider-configuration';

const createCaseSchema = z
  .object({
    action: z.literal('CREATE_CASE'),
    caseKey: z.string().regex(/^[a-z0-9-]{3,80}$/),
    title: z.string().min(3).max(200),
    query: z.string().min(3).max(1000),
    lookbackDays: z.number().int().min(1).max(30),
    maximumResults: z.number().int().min(1).max(10),
  })
  .strict();
const saveObservationSchema = z
  .object({
    action: z.literal('SAVE_OBSERVATION'),
    caseId: z.string().uuid(),
    provider: z.enum(['GROK', 'EXA', 'FIRECRAWL']),
    successful: z.boolean(),
    evidenceLines: z.string().max(10_000),
    costUsd: z.number().min(0).max(1000),
    latencyMs: z.number().int().min(0).max(600_000),
    relevanceRating: z.number().int().min(0).max(5),
    sourceQualityRating: z.number().int().min(0).max(5),
    notes: z.string().max(1000),
  })
  .strict();

function environment() {
  return currentAiProviderEnvironment();
}
async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin) throw new ApplicationError('NOT_FOUND', 'admin page not found');
  return user.userId;
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}
function evidence(value: string) {
  const rows = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [urlValue, publishedAtValue] = line.split('|').map((item) => item?.trim());
      let url: URL;
      try {
        url = new URL(urlValue ?? '');
      } catch {
        throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence URL');
      }
      if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw new ApplicationError('VALIDATION_ERROR', 'unsafe evidence URL');
      const publishedAt = publishedAtValue ? new Date(publishedAtValue) : null;
      if (publishedAt && Number.isNaN(publishedAt.getTime()))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid published date');
      return { url: url.toString(), publishedAt: publishedAt?.toISOString() ?? null };
    });
  if (new Set(rows.map((item) => item.url)).size !== rows.length)
    throw new ApplicationError('VALIDATION_ERROR', 'duplicate evidence URL');
  return rows;
}

export async function saveTrendProviderBenchmarkResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const userId = await actor();
    const value = await body(request);
    const createCase = createCaseSchema.safeParse(value);
    const observation = saveObservationSchema.safeParse(value);
    const db = await import('@bunshin/database');
    if (createCase.success) {
      const created = await db.prisma.trendProviderBenchmarkCase.create({
        data: {
          environment: environment(),
          caseKey: createCase.data.caseKey,
          title: createCase.data.title.trim(),
          query: createCase.data.query.trim(),
          lookbackDays: createCase.data.lookbackDays,
          maximumResults: createCase.data.maximumResults,
          createdByUserId: userId,
        },
      });
      return Response.json({ data: { id: created.id }, requestId }, { status: 201 });
    }
    if (observation.success) {
      const benchmarkCase = await db.prisma.trendProviderBenchmarkCase.findFirst({
        where: { id: observation.data.caseId, environment: environment(), active: true },
        select: { id: true },
      });
      if (!benchmarkCase) throw new ApplicationError('NOT_FOUND', 'benchmark case not found');
      const saved = await db.prisma.trendProviderBenchmarkObservation.upsert({
        where: {
          caseId_provider: { caseId: benchmarkCase.id, provider: observation.data.provider },
        },
        create: {
          caseId: benchmarkCase.id,
          provider: observation.data.provider,
          successful: observation.data.successful,
          evidence: evidence(observation.data.evidenceLines),
          costUsdMicros: Math.round(observation.data.costUsd * 1_000_000),
          latencyMs: observation.data.latencyMs,
          relevanceRating: observation.data.relevanceRating,
          sourceQualityRating: observation.data.sourceQualityRating,
          notes: observation.data.notes.trim() || null,
          updatedByUserId: userId,
        },
        update: {
          successful: observation.data.successful,
          evidence: evidence(observation.data.evidenceLines),
          costUsdMicros: Math.round(observation.data.costUsd * 1_000_000),
          latencyMs: observation.data.latencyMs,
          relevanceRating: observation.data.relevanceRating,
          sourceQualityRating: observation.data.sourceQualityRating,
          notes: observation.data.notes.trim() || null,
          updatedByUserId: userId,
        },
      });
      return Response.json({ data: { id: saved.id }, requestId });
    }
    throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
