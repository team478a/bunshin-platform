import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import {
  externalTrackingResponse as respond,
  externalTrackingService as service,
  externalTrackingUuid as uuid,
} from './external-tracking-http-core';
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
      const kind = z
        .enum(['links', 'usages', 'results'])
        .parse(url.searchParams.get('kind') ?? 'links');
      if (serviceId && groupId !== serviceId)
        throw new ApplicationError('FORBIDDEN', 'service boundary mismatch');
      const { scope, value } = await service(workspaceId, serviceId);
      const configuration = (await value.listConfiguration({ ...scope, groupId })) as {
        links: Array<Record<string, unknown>>;
        usages: Array<Record<string, unknown>>;
        results: Array<Record<string, unknown>>;
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
          : kind === 'usages'
            ? [
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
              ]
            : [
                [
                  '成果日時',
                  '外部サービス',
                  '成果種別',
                  '件数',
                  '金額（最小単位）',
                  '通貨',
                  '参加者',
                  'URL名',
                ],
                ...configuration.results.map((result) => {
                  const system = result['system'] as { name?: unknown } | undefined;
                  const link = result['externalTrackingLink'] as { name?: unknown } | undefined;
                  const identity = result['memberIdentity'] as
                    { groupMembership?: { user?: { displayName?: unknown } } } | undefined;
                  return [
                    result['occurredAt'],
                    system?.name,
                    result['metricType'],
                    result['count'],
                    result['amountMinor'],
                    result['currency'],
                    identity?.groupMembership?.user?.displayName,
                    link?.name,
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
