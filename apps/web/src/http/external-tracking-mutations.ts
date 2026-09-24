import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import { requireSameOrigin } from '../auth/request-security';
import { queueMemberTrackingLinkResultNotification } from '../services/member-tracking-link-notification';
import {
  externalTrackingJson as json,
  externalTrackingResponse as respond,
  externalTrackingService as service,
  externalTrackingUuid as uuid,
  toExternalTrackingDate as toDate,
} from './external-tracking-http-core';

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
export function createExternalTrackingSystemResponse(
  request: Request,
  workspaceId: string,
  serviceId?: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const input = systemSchema.parse(await json(request));
      if (serviceId && input.groupId !== serviceId)
        throw new ApplicationError('FORBIDDEN', 'service boundary mismatch');
      const { scope, value } = await service(workspaceId, serviceId);
      return value.createSystem({
        ...scope,
        ...input,
        externalSystemId: input.externalSystemId ?? null,
      });
    },
    201,
  );
}

export function createExternalTrackingDomainResponse(
  request: Request,
  workspaceId: string,
  serviceId?: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const input = domainSchema.parse(await json(request));
      const { scope, value } = await service(workspaceId, serviceId);
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

export function upsertExternalTrackingIdentityResponse(
  request: Request,
  workspaceId: string,
  serviceId?: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const input = identitySchema.parse(await json(request));
    const { scope, value } = await service(workspaceId, serviceId);
    return value.upsertMemberIdentity({
      ...scope,
      ...input,
      commonUserId: input.commonUserId ?? null,
      agencyId: input.agencyId ?? null,
      externalMemberId: input.externalMemberId ?? null,
    });
  });
}

export function createExternalTrackingLinkResponse(
  request: Request,
  workspaceId: string,
  serviceId?: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const input = linkSchema.parse(await json(request));
      const { scope, value } = await service(workspaceId, serviceId);
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
  serviceId?: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const input = updateSchema.parse(await json(request));
    const { scope, value } = await service(workspaceId, serviceId);
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
  serviceId?: string,
  notification?: { serviceSlug: string; serviceName: string },
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const { scope, value } = await service(workspaceId, serviceId);
    const input = { ...scope, linkId: uuid.parse(linkId) };
    const link = await (action === 'activate'
      ? value.activateLink(input)
      : value.suspendLink(input));
    if (serviceId && notification)
      await queueMemberTrackingLinkResultNotification({
        workspaceId,
        groupId: serviceId,
        linkId: input.linkId,
        actorUserId: scope.actorUserId,
        serviceSlug: notification.serviceSlug,
        serviceName: notification.serviceName,
        result: action === 'activate' ? 'ACTIVATED' : 'REVISION_REQUESTED',
      });
    return link;
  });
}
