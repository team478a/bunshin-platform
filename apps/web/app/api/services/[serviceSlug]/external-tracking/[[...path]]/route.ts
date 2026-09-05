import { ApplicationError } from '@bunshin/shared';
import {
  createExternalTrackingDomainResponse,
  createExternalTrackingLinkResponse,
  createExternalTrackingSystemResponse,
  exportExternalTrackingResponse,
  importExternalTrackingCsvResponse,
  listExternalTrackingConfigurationResponse,
  transitionExternalTrackingLinkResponse,
  updateExternalTrackingLinkResponse,
  upsertExternalTrackingIdentityResponse,
} from '../../../../../../src/http/external-tracking-links';
import { resolvePublicServiceContext } from '../../../../../../src/services/public-service';

type Context = { params: Promise<{ serviceSlug: string; path?: string[] }> };

async function scope(context: Context) {
  const { serviceSlug, path = [] } = await context.params;
  return { service: await resolvePublicServiceContext(serviceSlug), path };
}

export async function GET(request: Request, context: Context) {
  const { service, path } = await scope(context);
  if (path.length === 0)
    return listExternalTrackingConfigurationResponse(
      request,
      service.workspaceId,
      service.serviceId,
    );
  if (path.length === 1 && path[0] === 'export')
    return exportExternalTrackingResponse(request, service.workspaceId, service.serviceId);
  throw new ApplicationError('NOT_FOUND', 'route unavailable');
}

export async function POST(request: Request, context: Context) {
  const { service, path } = await scope(context);
  const args = [request, service.workspaceId, service.serviceId] as const;
  if (path.length === 1 && path[0] === 'systems')
    return createExternalTrackingSystemResponse(...args);
  if (path.length === 1 && path[0] === 'domains')
    return createExternalTrackingDomainResponse(...args);
  if (path.length === 1 && path[0] === 'identities')
    return upsertExternalTrackingIdentityResponse(...args);
  if (path.length === 1 && path[0] === 'links') return createExternalTrackingLinkResponse(...args);
  if (path.length === 1 && path[0] === 'import') return importExternalTrackingCsvResponse(...args);
  if (path.length === 2 && path[0] === 'links')
    return updateExternalTrackingLinkResponse(
      request,
      service.workspaceId,
      path[1]!,
      service.serviceId,
    );
  if (path.length === 3 && path[0] === 'links' && (path[2] === 'activate' || path[2] === 'suspend'))
    return transitionExternalTrackingLinkResponse(
      request,
      service.workspaceId,
      path[1]!,
      path[2],
      service.serviceId,
      {
        serviceSlug: service.configuration.slug,
        serviceName: service.configuration.displayName,
      },
    );
  throw new ApplicationError('NOT_FOUND', 'route unavailable');
}
