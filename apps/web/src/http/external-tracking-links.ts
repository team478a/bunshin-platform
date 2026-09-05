import 'server-only';
import {
  ExternalLinkPlacementService,
  ExternalTrackingLinkService,
  validateExternalTrackingUrl,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { queueMemberTrackingLinkResultNotification } from '../services/member-tracking-link-notification';
import {
  EXTERNAL_TRACKING_CSV_MAX_BYTES,
  parseExternalTrackingCsv,
} from '../external-tracking/csv-import';

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

async function service(workspaceId: string, serviceId?: string) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  return {
    scope: { workspaceId: uuid.parse(workspaceId), actorUserId: user.userId },
    value: new ExternalTrackingLinkService(
      new db.PrismaExternalTrackingLinkRepository(undefined, serviceId),
    ),
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

export function listExternalTrackingConfigurationResponse(
  request: Request,
  workspaceId: string,
  serviceId?: string,
) {
  return respond(request, async () => {
    const groupId = uuid.parse(new URL(request.url).searchParams.get('groupId'));
    if (serviceId && groupId !== serviceId)
      throw new ApplicationError('FORBIDDEN', 'service boundary mismatch');
    const { scope, value } = await service(workspaceId, serviceId);
    return value.listConfiguration({ ...scope, groupId });
  });
}

const csvCell = (value: unknown) => {
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '';
  return `"${text.replaceAll('"', '""')}"`;
};

export function exportExternalTrackingResponse(
  request: Request,
  workspaceId: string,
  serviceId?: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  return (async () => {
    try {
      const url = new URL(request.url);
      const groupId = uuid.parse(url.searchParams.get('groupId'));
      const kind = z.enum(['links', 'usages']).parse(url.searchParams.get('kind') ?? 'links');
      if (serviceId && groupId !== serviceId)
        throw new ApplicationError('FORBIDDEN', 'service boundary mismatch');
      const { scope, value } = await service(workspaceId, serviceId);
      const configuration = (await value.listConfiguration({ ...scope, groupId })) as {
        links: Array<Record<string, unknown>>;
        usages: Array<Record<string, unknown>>;
      };
      const rows =
        kind === 'links'
          ? [
              ['URL名', '状態', '対象', '専用URL', '開始日時', '終了日時', '更新日時'],
              ...configuration.links.map((link) => [
                link['name'],
                link['effectiveStatus'],
                link['scopeType'],
                link['url'],
                link['startsAt'],
                link['expiresAt'],
                link['updatedAt'],
              ]),
            ]
          : [
              ['使用日時', '参加者', '商品', '企画', 'URL名', '使用URL', 'URL期限'],
              ...configuration.usages.map((usage) => {
                const member = usage['groupMembership'] as
                  { user?: { displayName?: unknown } } | undefined;
                const product = usage['productPack'] as { name?: unknown } | undefined;
                const campaign = usage['campaign'] as { name?: unknown } | undefined;
                return [
                  usage['createdAt'],
                  member?.user?.displayName,
                  product?.name,
                  campaign?.name,
                  usage['linkNameSnapshot'],
                  usage['insertedUrlSnapshot'],
                  usage['expiresAtSnapshot'],
                ];
              }),
            ];
      return new Response(`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="external-tracking-${kind}.csv"`,
          'cache-control': 'private, no-store',
        },
      });
    } catch (error) {
      const mapped = toApiError(error, requestId);
      return Response.json(mapped.body, {
        status: mapped.status,
        headers: { 'cache-control': 'private, no-store' },
      });
    }
  })();
}

type ImportConfiguration = {
  systems: Array<{
    id: string;
    status: string;
    allowedDomains: Array<{
      id: string;
      hostname: string;
      allowSubdomains: boolean;
      shortener: boolean;
      status: 'ACTIVE' | 'SUSPENDED';
    }>;
  }>;
  members: Array<{ id: string; consentedAt: Date | string | null; user: { email: string | null } }>;
  products: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
  links: Array<{
    externalLinkId: string | null;
    url: string;
    productPackId: string | null;
    campaignId: string | null;
    memberIdentity: { groupMembershipId: string } | null;
  }>;
};

const dateFromCsv = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()))
    throw new ApplicationError('VALIDATION_ERROR', '日時の書き方が正しくありません。');
  return date;
};

const findCatalogItem = <T extends { id: string; name: string }>(items: T[], value: string) => {
  if (!value) return null;
  const matches = items.filter((item) => item.id === value || item.name === value);
  if (matches.length !== 1)
    throw new ApplicationError('VALIDATION_ERROR', '商品または企画を1件に特定できません。');
  return matches[0]!;
};

export function importExternalTrackingCsvResponse(
  request: Request,
  workspaceId: string,
  serviceId?: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > EXTERNAL_TRACKING_CSV_MAX_BYTES + 100_000)
      throw new ApplicationError('VALIDATION_ERROR', 'CSVは5MB以下にしてください。');
    const form = await request.formData();
    const groupId = uuid.parse(form.get('groupId'));
    if (serviceId && groupId !== serviceId)
      throw new ApplicationError('FORBIDDEN', 'service boundary mismatch');
    const systemId = uuid.parse(form.get('systemId'));
    const allowedDomainId = uuid.parse(form.get('allowedDomainId'));
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0)
      throw new ApplicationError('VALIDATION_ERROR', 'CSVファイルを選んでください。');
    const rows = parseExternalTrackingCsv(new Uint8Array(await file.arrayBuffer()));
    const { scope, value } = await service(workspaceId, serviceId);
    const configuration = (await value.listConfiguration({
      ...scope,
      groupId,
    })) as ImportConfiguration;
    const system = configuration.systems.find(
      (item) => item.id === systemId && item.status === 'ACTIVE',
    );
    const domain = system?.allowedDomains.find(
      (item) => item.id === allowedDomainId && item.status === 'ACTIVE',
    );
    if (!system || !domain)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        '外部サービスまたはドメインを確認してください。',
      );
    const seen = new Set<string>();
    const results: Array<{ rowNumber: number; status: 'IMPORTED' | 'ERROR'; message: string }> = [];
    for (const row of rows) {
      try {
        if (!row.url) throw new ApplicationError('VALIDATION_ERROR', '専用URLがありません。');
        const member = row.participant_id
          ? configuration.members.find((item) => item.id === row.participant_id)
          : row.email
            ? configuration.members.find(
                (item) => item.user.email?.toLowerCase() === row.email.toLowerCase(),
              )
            : null;
        if ((row.participant_id || row.email) && (!member || !member.consentedAt))
          throw new ApplicationError('VALIDATION_ERROR', '利用できる参加者が見つかりません。');
        const product = findCatalogItem(configuration.products, row.product_code);
        const campaign = findCatalogItem(configuration.campaigns, row.campaign_code);
        if (product && campaign)
          throw new ApplicationError('VALIDATION_ERROR', '商品と企画は同時に指定できません。');
        const duplicateKey = [
          member?.id ?? '',
          product?.id ?? '',
          campaign?.id ?? '',
          row.url,
        ].join('|');
        const alreadyExists = configuration.links.some(
          (link) =>
            (row.external_link_id && link.externalLinkId === row.external_link_id) ||
            [
              link.memberIdentity?.groupMembershipId ?? '',
              link.productPackId ?? '',
              link.campaignId ?? '',
              link.url,
            ].join('|') === duplicateKey,
        );
        if (alreadyExists || seen.has(duplicateKey))
          throw new ApplicationError('CONFLICT', '同じ条件の専用URLがすでにあります。');
        const startsAt = dateFromCsv(row.starts_at);
        const expiresAt = dateFromCsv(row.expires_at);
        if (startsAt && expiresAt && startsAt >= expiresAt)
          throw new ApplicationError(
            'VALIDATION_ERROR',
            '開始日時は終了日時より前にしてください。',
          );
        validateExternalTrackingUrl(row.url, domain);
        let memberIdentityId: string | null = null;
        if (member) {
          const identity = (await value.upsertMemberIdentity({
            ...scope,
            systemId,
            groupMembershipId: member.id,
            commonUserId: null,
            agencyId: row.agency_id || null,
            externalMemberId: row.external_member_id || null,
          })) as { id: string };
          memberIdentityId = identity.id;
        }
        const scopeType = member
          ? campaign
            ? 'CAMPAIGN_MEMBER'
            : product
              ? 'PRODUCT_MEMBER'
              : 'MEMBER'
          : campaign
            ? 'CAMPAIGN'
            : product
              ? 'PRODUCT'
              : 'GROUP';
        await value.createLink({
          ...scope,
          systemId,
          allowedDomainId,
          memberIdentityId,
          productPackId: product?.id ?? null,
          campaignId: campaign?.id ?? null,
          scopeType,
          name: row.url_name || `CSV ${row.rowNumber}行目`,
          externalLinkId: row.external_link_id || null,
          referralToken: null,
          url: row.url,
          startsAt,
          expiresAt,
          notes: 'CSV取込',
        });
        seen.add(duplicateKey);
        results.push({
          rowNumber: row.rowNumber,
          status: 'IMPORTED',
          message: '下書きで登録しました。',
        });
      } catch (error) {
        results.push({
          rowNumber: row.rowNumber,
          status: 'ERROR',
          message: error instanceof Error ? error.message : '登録できませんでした。',
        });
      }
    }
    const imported = results.filter((item) => item.status === 'IMPORTED').length;
    return { total: rows.length, imported, failed: rows.length - imported, results };
  });
}

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
