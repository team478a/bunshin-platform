import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import {
  resolveManagedServiceContext,
  type ManagedServiceContext,
} from '../services/public-service';

export async function resolveServiceContentContext(serviceSlug: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  try {
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId, 'CONTENT');
    return { actorUserId: actor.userId, service };
  } catch (error) {
    if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND')
      throw new ApplicationError('NOT_FOUND', 'service not found');
    throw error;
  }
}

export async function withServiceContentContext(
  request: Request,
  serviceSlug: string,
  operation: (service: ManagedServiceContext) => Promise<Response>,
): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const { service } = await resolveServiceContentContext(serviceSlug);
    return await operation(service);
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
