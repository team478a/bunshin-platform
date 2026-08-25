import 'server-only';
import { CampaignService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuid = z.string().uuid();
const createSchema = z
  .object({
    groupId: uuid,
    productPackVersionId: uuid,
    name: z.string().min(1).max(160),
    theme: z.string().min(1).max(1000),
    targetSummary: z.string().min(1).max(1000),
    participationLimit: z.number().int().min(1).max(10000),
    maxRelatedPerWeek: z.number().int().min(0).max(7).default(2),
    maxAdsPerWeek: z.number().int().min(0).max(7).default(1),
    cooldownDays: z.number().int().min(0).max(30).default(2),
    generationLimitPerParticipant: z.number().int().min(1).max(365).default(60),
    similarityThresholdBasisPoints: z.number().int().min(7000).max(10000).default(8500),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    assetIds: z.array(uuid).max(100),
  })
  .strict();
const transitionSchema = z
  .object({
    from: z.enum(['DRAFT', 'OPEN']),
    to: z.enum(['OPEN', 'CLOSED', 'CANCELLED']),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict();
const decisionSchema = z
  .object({
    decision: z.enum(['ACCEPTED', 'DECLINED', 'ON_HOLD', 'WITHDRAWN']),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict();

async function context() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  return {
    actorUserId: user.userId,
    service: new CampaignService(new db.PrismaCampaignRepository()),
  };
}

async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  return request.json() as Promise<unknown>;
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

export function managedCampaignsResponse(request: Request, workspaceId: string) {
  return respond(request, async () => {
    const { actorUserId, service } = await context();
    return service.listManaged({ workspaceId: uuid.parse(workspaceId), actorUserId });
  });
}

export function createCampaignResponse(request: Request, workspaceId: string) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const value = createSchema.parse(await body(request));
      const { actorUserId, service } = await context();
      return service.createDraft({
        workspaceId: uuid.parse(workspaceId),
        actorUserId,
        ...value,
        startsAt: new Date(value.startsAt),
        endsAt: new Date(value.endsAt),
      });
    },
    201,
  );
}

export function transitionCampaignResponse(
  request: Request,
  workspaceId: string,
  campaignId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const value = transitionSchema.parse(await body(request));
    const { actorUserId, service } = await context();
    return service.transition({
      workspaceId: uuid.parse(workspaceId),
      actorUserId,
      campaignId: uuid.parse(campaignId),
      from: value.from,
      to: value.to,
      reason: value.reason ?? null,
    });
  });
}

export function availableCampaignsResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const { actorUserId, service } = await context();
    return service.listAvailable({
      workspaceId: uuid.parse(workspaceId),
      actorUserId,
      bunshinId: uuid.parse(bunshinId),
    });
  });
}

export function decideCampaignResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  campaignId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const value = decisionSchema.parse(await body(request));
    const { actorUserId, service } = await context();
    return service.decide({
      workspaceId: uuid.parse(workspaceId),
      actorUserId,
      bunshinId: uuid.parse(bunshinId),
      campaignId: uuid.parse(campaignId),
      decision: value.decision,
      reason: value.reason ?? null,
    });
  });
}
