import 'server-only';
import { MemberProductActivityService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';

const inputSchema = z
  .object({
    activityId: z.string().uuid(),
    type: z.enum(['COPIED', 'POSTED']),
    candidateIndex: z.number().int().min(0).max(9),
  })
  .strict();

export async function recordMemberProductActivityResponse(request: Request, serviceSlug: string) {
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
    const result = await new MemberProductActivityService(
      new db.PrismaMemberProductActivityRepository(),
    ).recordEvent({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      contentRunId: input.activityId,
      type: input.type,
      candidateIndex: input.candidateIndex,
      operationKey: `${requestId}:member-product-activity`,
    });
    return Response.json(
      { data: result, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
