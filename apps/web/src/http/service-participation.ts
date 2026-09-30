import 'server-only';
import { ServiceParticipationService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const requestSchema = z
  .object({
    legalDocumentIds: z.array(z.string().uuid()).max(3),
    referralCode: z.string().max(80).nullable().optional(),
    referralClickId: z.string().uuid().nullable().optional(),
  })
  .strict();
const legalConsentSchema = z
  .object({ legalDocumentIds: z.array(z.string().uuid()).max(3) })
  .strict();
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
      referralCode: value.referralCode ?? null,
      referralClickId: value.referralClickId ?? null,
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

export async function acceptServiceLegalDocumentsResponse(request: Request, slug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON body');
    }
    const parsed = legalConsentSchema.safeParse(body);
    const parsedSlug = slugSchema.safeParse(slug);
    if (!parsed.success || !parsedSlug.success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service legal consent');
    await (
      await service()
    ).acceptLegalDocuments({
      slug: parsedSlug.data,
      actorUserId: actor.userId,
      legalDocumentIds: parsed.data.legalDocumentIds,
    });
    return Response.json(
      { data: { accepted: true }, requestId },
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

export async function withdrawServiceParticipationResponse(request: Request, slug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const membership = await (
      await service()
    ).withdraw({ slug: slugSchema.parse(slug), actorUserId: actor.userId });
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
