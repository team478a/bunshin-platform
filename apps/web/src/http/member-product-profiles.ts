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
    profileId: z.string().uuid().nullable().optional(),
    externalTrackingLinkId: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    appealPoint: z.string().trim().min(1).max(1000),
    targetAudience: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export async function saveMemberProductProfileResponse(request: Request, serviceSlug: string) {
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
    const saved = await new MemberProductProfileService(
      new db.PrismaMemberProductProfileRepository(),
    ).save({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      ...input,
    });
    return Response.json(
      { data: saved, requestId },
      { status: input.profileId ? 200 : 201, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
