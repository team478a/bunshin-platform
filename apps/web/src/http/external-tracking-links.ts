import 'server-only';
import { ExternalLinkPlacementService, ExternalTrackingLinkService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuid = z.string().uuid();
const optionalId = uuid.nullable().optional();
const optionalDate = z.string().datetime().nullable().optional();
const systemSchema = z
  .object({
    groupId: uuid,
    name: z.string().min(1).max(160),
    systemType: z.string().min(1).max(80),
    externalSystemId: z.string().min(1).max(255).nullable().optional(),
  })
  .strict();
const domainSchema = z
  .object({
    systemId: uuid,
    hostname: z.string().min(1).max(253),
    allowSubdomains: z.boolean().optional(),
    shortener: z.boolean().optional(),
  })
  .strict();
const identitySchema = z
  .object({
    systemId: uuid,
    groupMembershipId: uuid,
    commonUserId: z.string().min(1).max(255).nullable().optional(),
    agencyId: z.string().min(1).max(255).nullable().optional(),
    externalMemberId: z.string().min(1).max(255).nullable().optional(),
  })
  .strict();
const linkSchema = z
  .object({
    systemId: uuid,
    allowedDomainId: uuid,
    memberIdentityId: optionalId,
    productPackId: optionalId,
    campaignId: optionalId,
    scopeType: z.enum([
      'GROUP',
      'MEMBER',
      'PRODUCT',
      'CAMPAIGN',
      'PRODUCT_MEMBER',
      'CAMPAIGN_MEMBER',
    ]),
    name: z.string().min(1).max(160),
    externalLinkId: z.string().min(1).max(255).nullable().optional(),
    referralToken: z.string().min(1).max(500).nullable().optional(),
    url: z.string().min(1).max(2048),
    startsAt: optionalDate,
    expiresAt: optionalDate,
    notes: z.string().min(1).max(1000).nullable().optional(),
  })
  .strict();
const updateSchema = z
  .object({
    allowedDomainId: uuid,
    name: z.string().min(1).max(160),
    url: z.string().min(1).max(2048),
    startsAt: optionalDate,
    expiresAt: optionalDate,
    notes: z.string().min(1).max(1000).nullable().optional(),
  })
  .strict();
const placementSchema = z
  .object({
    productPackVersionId: uuid,
    platform: z.enum(['INSTAGRAM', 'TIKTOK', 'X', 'THREADS', 'YOUTUBE_SHORTS', 'OTHER']),
    format: z.enum(['TEXT', 'SLIDE', 'LIVE_ACTION', 'AI_VIDEO_PROMPT', 'IMAGE']),
    target: z.enum(['BODY', 'CAPTION', 'DESCRIPTION']),
    template: z.string().min(1).max(2000),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .strict();

const toDate = (value: string | null | undefined) => (value ? new Date(value) : null);

async function service(workspaceId: string) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  return {
    scope: { workspaceId: uuid.parse(workspaceId), actorUserId: user.userId },
    value: new ExternalTrackingLinkService(new db.PrismaExternalTrackingLinkRepository()),
  };
}

async function placementService(workspaceId: string) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  return {
    scope: { workspaceId: uuid.parse(workspaceId), actorUserId: user.userId },
    value: new ExternalLinkPlacementService(new db.PrismaExternalLinkPlacementRepository()),
  };
}

async function json(request: Request) {
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

export function listExternalTrackingConfigurationResponse(request: Request, workspaceId: string) {
  return respond(request, async () => {
    const groupId = uuid.parse(new URL(request.url).searchParams.get('groupId'));
    const { scope, value } = await service(workspaceId);
    return value.listConfiguration({ ...scope, groupId });
  });
}

export function createExternalTrackingSystemResponse(request: Request, workspaceId: string) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const input = systemSchema.parse(await json(request));
      const { scope, value } = await service(workspaceId);
      return value.createSystem({
        ...scope,
        ...input,
        externalSystemId: input.externalSystemId ?? null,
      });
    },
    201,
  );
}

export function createExternalTrackingDomainResponse(request: Request, workspaceId: string) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const input = domainSchema.parse(await json(request));
      const { scope, value } = await service(workspaceId);
      return value.addAllowedDomain({
        ...scope,
        ...input,
        allowSubdomains: input.allowSubdomains ?? false,
        shortener: input.shortener ?? false,
      });
    },
    201,
  );
}

export function upsertExternalTrackingIdentityResponse(request: Request, workspaceId: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const input = identitySchema.parse(await json(request));
    const { scope, value } = await service(workspaceId);
    return value.upsertMemberIdentity({
      ...scope,
      ...input,
      commonUserId: input.commonUserId ?? null,
      agencyId: input.agencyId ?? null,
      externalMemberId: input.externalMemberId ?? null,
    });
  });
}

export function createExternalTrackingLinkResponse(request: Request, workspaceId: string) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const input = linkSchema.parse(await json(request));
      const { scope, value } = await service(workspaceId);
      return value.createLink({
        ...scope,
        ...input,
        memberIdentityId: input.memberIdentityId ?? null,
        productPackId: input.productPackId ?? null,
        campaignId: input.campaignId ?? null,
        externalLinkId: input.externalLinkId ?? null,
        referralToken: input.referralToken ?? null,
        startsAt: toDate(input.startsAt),
        expiresAt: toDate(input.expiresAt),
        notes: input.notes ?? null,
      });
    },
    201,
  );
}

export function updateExternalTrackingLinkResponse(
  request: Request,
  workspaceId: string,
  linkId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const input = updateSchema.parse(await json(request));
    const { scope, value } = await service(workspaceId);
    return value.updateLink({
      ...scope,
      linkId: uuid.parse(linkId),
      ...input,
      startsAt: toDate(input.startsAt),
      expiresAt: toDate(input.expiresAt),
      notes: input.notes ?? null,
    });
  });
}

export function transitionExternalTrackingLinkResponse(
  request: Request,
  workspaceId: string,
  linkId: string,
  action: 'activate' | 'suspend',
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const { scope, value } = await service(workspaceId);
    const input = { ...scope, linkId: uuid.parse(linkId) };
    return action === 'activate' ? value.activateLink(input) : value.suspendLink(input);
  });
}

export function listExternalLinkPlacementsResponse(request: Request, workspaceId: string) {
  return respond(request, async () => {
    const productPackVersionId = uuid.parse(
      new URL(request.url).searchParams.get('productPackVersionId'),
    );
    const { scope, value } = await placementService(workspaceId);
    return value.list({ ...scope, productPackVersionId });
  });
}

export function upsertExternalLinkPlacementResponse(request: Request, workspaceId: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const input = placementSchema.parse(await json(request));
    const { scope, value } = await placementService(workspaceId);
    return value.upsert({ ...scope, ...input, status: input.status ?? 'ACTIVE' });
  });
}
