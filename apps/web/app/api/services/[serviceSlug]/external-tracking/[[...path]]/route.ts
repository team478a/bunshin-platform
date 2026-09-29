import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
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
import { rotateExternalTrackingResultTokenResponse } from '../../../../../../src/http/external-tracking-results';
import {
  resolveManagedServiceContext,
  type ManagedServiceContext,
} from '../../../../../../src/services/public-service';

type Context = { params: Promise<{ serviceSlug: string; path?: string[] }> };

async function scope(context: Context) {
  const { serviceSlug, path = [] } = await context.params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  try {
    return {
      service: await resolveManagedServiceContext(serviceSlug, actor.userId, 'ADMINISTRATION'),
      path,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND')
      throw new ApplicationError('NOT_FOUND', 'service not found');
    throw error;
  }
}

async function respond(
  request: Request,
  context: Context,
  operation: (service: ManagedServiceContext, path: string[]) => Promise<Response>,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const { service, path } = await scope(context);
    return await operation(service, path);
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function GET(request: Request, context: Context) {
  return respond(request, context, (service, path) => {
    if (path.length === 0)
      return listExternalTrackingConfigurationResponse(
        request,
        service.workspaceId,
        service.serviceId,
      );
    if (path.length === 1 && path[0] === 'export')
      return exportExternalTrackingResponse(request, service.workspaceId, service.serviceId);
    throw new ApplicationError('NOT_FOUND', 'route unavailable');
  });
}

export async function POST(request: Request, context: Context) {
  return respond(request, context, (service, path) => {
    const args = [request, service.workspaceId, service.serviceId] as const;
    if (path.length === 1 && path[0] === 'systems')
      return createExternalTrackingSystemResponse(...args);
    if (path.length === 1 && path[0] === 'domains')
      return createExternalTrackingDomainResponse(...args);
    if (path.length === 1 && path[0] === 'identities')
      return upsertExternalTrackingIdentityResponse(...args);
    if (path.length === 1 && path[0] === 'links')
      return createExternalTrackingLinkResponse(...args);
    if (path.length === 1 && path[0] === 'import')
      return importExternalTrackingCsvResponse(...args);
    if (path.length === 3 && path[0] === 'systems' && path[2] === 'result-token')
      return rotateExternalTrackingResultTokenResponse(
        request,
        service.workspaceId,
        path[1]!,
        service.serviceId,
      );
    if (path.length === 2 && path[0] === 'links')
      return updateExternalTrackingLinkResponse(
        request,
        service.workspaceId,
        path[1]!,
        service.serviceId,
      );
    if (
      path.length === 3 &&
      path[0] === 'links' &&
      (path[2] === 'activate' || path[2] === 'suspend')
    )
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
  });
}
