import 'server-only';
import { ServiceParticipationService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const requestSchema = z.object({ legalDocumentIds: z.array(z.string().uuid()).max(2) }).strict();
const approvalSchema = z.object({ reason: z.string().min(5).max(1000) }).strict();
const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
const uuid = z.string().uuid();

async function service() {
  const db = await import('@bunshin/database');
  return new ServiceParticipationService(new db.PrismaServiceParticipationRepository());
}

export async function requestServiceParticipationResponse(request: Request, slug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = requestSchema.parse(await request.json());
    const membership = await (
      await service()
    ).request({
      slug: slugSchema.parse(slug),
      actorUserId: actor.userId,
      legalDocumentIds: value.legalDocumentIds,
    });
    return Response.json(
      { data: membership, requestId },
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

export async function approveServiceParticipationResponse(
  request: Request,
  workspaceId: string,
  serviceId: string,
  membershipId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = approvalSchema.parse(await request.json());
    const membership = await (
      await service()
    ).approve({
      workspaceId: uuid.parse(workspaceId),
      serviceId: uuid.parse(serviceId),
      groupMembershipId: uuid.parse(membershipId),
      actorUserId: actor.userId,
      reason: value.reason,
    });
    return Response.json(
      { data: membership, requestId },
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
