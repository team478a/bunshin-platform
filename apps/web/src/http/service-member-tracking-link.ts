import 'server-only';
import { ExternalTrackingMemberLinkService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';

const inputSchema = z
  .object({
    systemId: z.string().uuid(),
    allowedDomainId: z.string().uuid(),
    url: z.string().min(1).max(2048),
  })
  .strict();

export async function saveServiceMemberTrackingLink(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, input] = await Promise.all([
      resolvePublicServiceContext(serviceSlug),
      inputSchema.parseAsync(await request.json()),
    ]);
    const db = await import('@bunshin/database');
    const saved = await new ExternalTrackingMemberLinkService(
      new db.PrismaExternalTrackingLinkRepository(undefined, service.serviceId),
    ).saveDraft({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      ...input,
    });
    return Response.json(
      { data: saved, requestId },
      { status: 201, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
