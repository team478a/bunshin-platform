import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import {
  activateGroupLineConfigurationResponse,
  createGroupLineConfigurationResponse,
  listGroupLineConfigurationsResponse,
  setGroupLinePolicyResponse,
  testGroupLineConfigurationResponse,
} from '../../../../../../src/http/group-line-configurations';
import { resolveManagedServiceContext } from '../../../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ serviceSlug: string; path?: string[] }> };

async function scope(context: Context) {
  const { serviceSlug, path = [] } = await context.params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return {
    service: await resolveManagedServiceContext(serviceSlug, actor.userId),
    path,
  };
}

async function dispatch(request: Request, operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function GET(request: Request, context: Context) {
  return dispatch(request, async () => {
    const { service, path } = await scope(context);
    if (path.length !== 0) throw new ApplicationError('NOT_FOUND', 'route not found');
    const url = new URL(request.url);
    url.searchParams.set('workspaceId', service.workspaceId);
    return listGroupLineConfigurationsResponse(new Request(url, request), service.serviceId);
  });
}

export async function POST(request: Request, context: Context) {
  return dispatch(request, async () => {
    const { service, path } = await scope(context);
    if (path.length === 0) return createGroupLineConfigurationResponse(request, service.serviceId);
    if (path.length === 2 && path[1] === 'test')
      return testGroupLineConfigurationResponse(request, service.serviceId, path[0]!);
    if (path.length === 2 && path[1] === 'activate')
      return activateGroupLineConfigurationResponse(request, service.serviceId, path[0]!);
    throw new ApplicationError('NOT_FOUND', 'route not found');
  });
}

export async function PUT(request: Request, context: Context) {
  return dispatch(request, async () => {
    const { service, path } = await scope(context);
    if (path.length === 1 && path[0] === 'policy')
      return setGroupLinePolicyResponse(request, service.serviceId);
    throw new ApplicationError('NOT_FOUND', 'route not found');
  });
}
