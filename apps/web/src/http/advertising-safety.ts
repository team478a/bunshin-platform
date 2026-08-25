import 'server-only';
import { AdvertisingSafetyService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuid = z.string().uuid();
const httpsUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === 'https:');
const evidenceSchema = z
  .object({
    type: z.enum(['EXPERIENCE', 'USAGE', 'RESULT', 'QUALIFICATION']),
    title: z.string().min(1).max(160),
    claim: z.string().min(1).max(1000),
    sourceUrl: httpsUrl.nullable().optional(),
    occurredAt: z.string().datetime().nullable().optional(),
  })
  .strict();
const reviewSchema = z
  .object({
    dailyMissionId: uuid.nullable().optional(),
    productPackVersionId: uuid.nullable().optional(),
    classification: z.enum(['ORGANIC', 'PRODUCT_RELATED', 'ADVERTISEMENT']),
    evidenceRequirement: z.enum(['NONE', 'PERSONAL_EVIDENCE']),
    evidenceIds: z.array(uuid).max(20),
    officialClaims: z.record(z.string().min(1).max(100), z.string().max(2000)),
    content: z.string().min(1).max(20_000),
  })
  .strict();

async function service(workspaceId: string, bunshinId: string) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  return {
    scope: {
      workspaceId: uuid.parse(workspaceId),
      bunshinId: uuid.parse(bunshinId),
      actorUserId: user.userId,
    },
    value: new AdvertisingSafetyService(new db.PrismaAdvertisingSafetyRepository()),
  };
}

async function respond(request: Request, operation: () => Promise<unknown>, status = 200) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { status, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

async function json(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  return request.json() as Promise<unknown>;
}

export function listEvidenceResponse(request: Request, workspaceId: string, bunshinId: string) {
  return respond(request, async () => {
    const context = await service(workspaceId, bunshinId);
    return context.value.listEvidence(context.scope);
  });
}

export function createEvidenceResponse(request: Request, workspaceId: string, bunshinId: string) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = evidenceSchema.parse(await json(request));
      const context = await service(workspaceId, bunshinId);
      return context.value.createEvidence({
        ...context.scope,
        ...parsed,
        sourceUrl: parsed.sourceUrl ?? null,
        occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : null,
      });
    },
    201,
  );
}

export function revokeEvidenceResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  evidenceId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const context = await service(workspaceId, bunshinId);
    return context.value.revokeEvidence({ ...context.scope, evidenceId: uuid.parse(evidenceId) });
  });
}

export function listSafetyReviewsResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const context = await service(workspaceId, bunshinId);
    return context.value.listReviews(context.scope);
  });
}

export function createSafetyReviewResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = reviewSchema.parse(await json(request));
      const context = await service(workspaceId, bunshinId);
      return context.value.review({
        ...context.scope,
        ...parsed,
        dailyMissionId: parsed.dailyMissionId ?? null,
        productPackVersionId: parsed.productPackVersionId ?? null,
      });
    },
    201,
  );
}
