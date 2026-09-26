import 'server-only';
import { ExternalLinkPlacementService, ExternalTrackingLinkService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';

export const externalTrackingUuid = z.string().uuid();

export const toExternalTrackingDate = (value: string | null | undefined) =>
  value ? new Date(value) : null;

export async function externalTrackingService(workspaceId: string, serviceId?: string) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  return {
    scope: { workspaceId: externalTrackingUuid.parse(workspaceId), actorUserId: user.userId },
    value: new ExternalTrackingLinkService(
      new db.PrismaExternalTrackingLinkRepository(undefined, serviceId),
    ),
  };
}

export async function externalLinkPlacementService(workspaceId: string) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  return {
    scope: { workspaceId: externalTrackingUuid.parse(workspaceId), actorUserId: user.userId },
    value: new ExternalLinkPlacementService(new db.PrismaExternalLinkPlacementRepository()),
  };
}

export async function externalTrackingJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  return request.json() as Promise<unknown>;
}

export async function externalTrackingResponse(
  request: Request,
  operation: () => Promise<unknown>,
  status = 200,
) {
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
