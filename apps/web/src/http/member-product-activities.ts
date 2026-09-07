import 'server-only';
import { MemberProductProfileService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';

const inputSchema = z
  .object({
    type: z.enum(['COPIED', 'POSTED']),
    candidateIndex: z.number().int().min(0).max(2),
  })
  .strict();

export async function recordMemberProductActivityResponse(
  request: Request,
  serviceSlug: string,
  generationId: string,
) {
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
    const result = await new MemberProductProfileService(
      new db.PrismaMemberProductProfileRepository(),
    ).recordActivity({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      generationId,
      type: input.type,
      candidateIndex: input.candidateIndex,
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
