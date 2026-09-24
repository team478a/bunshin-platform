import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { resolveManagedServiceContext } from '../services/public-service';
import { csv } from './admin-report-export';
import { auditRows } from './service-reward-export-audit';
import { badgeRows, pointRows, summaryRows } from './service-reward-export-ledger';
import { pilotRows } from './service-reward-export-pilot';

const exportKinds = ['summary', 'points', 'badges', 'audit', 'pilot'] as const;
type ExportKind = (typeof exportKinds)[number];

export async function serviceRewardExportResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const requestedKind = new URL(request.url).searchParams.get('kind') ?? 'summary';
    if (!exportKinds.includes(requestedKind as ExportKind))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reward export kind');
    const kind = requestedKind as ExportKind;
    const rows =
      kind === 'pilot'
        ? await pilotRows(service.workspaceId, service.serviceId, new Date())
        : kind === 'audit'
          ? await auditRows(service.workspaceId, service.serviceId)
          : kind === 'points'
            ? await pointRows(service.workspaceId, service.serviceId)
            : kind === 'badges'
              ? await badgeRows(service.workspaceId, service.serviceId)
              : await summaryRows(service.workspaceId, service.serviceId);
    return new Response(csv(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="service-rewards-${kind}-${service.configuration.slug}.csv"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
