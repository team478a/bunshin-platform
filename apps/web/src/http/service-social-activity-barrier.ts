import 'server-only';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { SOCIAL_ACTIVITY_SUPPORT_ACTIONS } from '@bunshin/capability-social';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';
import { memberUsageReadLimit } from './member-usage-read-limit';

const answerSchema = z
  .object({
    caseIds: z.array(z.string().uuid()).min(1).max(5),
    selectedCaseId: z.string().uuid().nullable(),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();
const supportSchema = z
  .object({
    supportId: z.string().uuid(),
    action: z.enum(SOCIAL_ACTIVITY_SUPPORT_ACTIONS),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => value.reason === undefined || value.action === 'SKIP');

async function json(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function respond(request: Request, operation: (actorUserId: string) => Promise<unknown>) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  let release: (() => void) | undefined;
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (new URL(request.url).searchParams.size)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid query');
    const permit = memberUsageReadLimit.reserve(actor.userId);
    if (!permit.allowed)
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: '少し時間をおいてお試しください。', requestId } },
        {
          status: 429,
          headers: {
            'cache-control': 'private, no-store',
            vary: 'Cookie, Authorization',
            'retry-after': String(permit.retryAfterSeconds),
          },
        },
      );
    release = permit.release;
    return Response.json(
      { data: await operation(actor.userId), requestId },
      { headers: { 'cache-control': 'private, no-store', vary: 'Cookie, Authorization' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store', vary: 'Cookie, Authorization' },
    });
  } finally {
    release?.();
  }
}

async function resolveScope(serviceSlug: string, bunshinId: string, actorUserId: string) {
  if (!z.string().uuid().safeParse(bunshinId).success)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid Bunshin');
  const service = await resolveMemberServiceContext(serviceSlug, actorUserId);
  const db = await import('@bunshin/database');
  const [membership, bunshin] = await Promise.all([
    db.prisma.groupMembership.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: actorUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
    db.prisma.bunshin.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        id: bunshinId,
        ownerUserId: actorUserId,
        status: { not: 'ARCHIVED' },
      },
      select: { id: true },
    }),
  ]);
  if (!membership || !bunshin) throw new ApplicationError('NOT_FOUND', 'resource not found');
  return {
    repository: new db.PrismaSocialActivityBarrierConfirmationRepository(db.prisma),
    scope: {
      workspaceId: service.workspaceId,
      serviceId: service.serviceId,
      groupMembershipId: membership.id,
      userId: actorUserId,
      bunshinId,
    },
  };
}

export function getServiceSocialActivityBarrierResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async (actorUserId) => {
    const { repository, scope } = await resolveScope(serviceSlug, bunshinId, actorUserId);
    const [question, support] = await Promise.all([
      repository.getPendingQuestion({ scope }),
      repository.getActiveSupport({ scope }),
    ]);
    return { question, support };
  });
}

export function answerServiceSocialActivityBarrierResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async (actorUserId) => {
    requireSameOrigin(request);
    const parsed = answerSchema.safeParse(await json(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { repository, scope } = await resolveScope(serviceSlug, bunshinId, actorUserId);
    const result = await repository.answer({
      scope,
      caseIds: parsed.data.caseIds,
      selectedCaseId: parsed.data.selectedCaseId,
      idempotencyKey: parsed.data.idempotencyKey,
      answeredAt: new Date(),
    });
    if (!result) throw new ApplicationError('NOT_FOUND', 'barrier question not found');
    return { ...result, supportProgress: await repository.getActiveSupport({ scope }) };
  });
}

export function transitionServiceSocialActivitySupportResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async (actorUserId) => {
    requireSameOrigin(request);
    const parsed = supportSchema.safeParse(await json(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { repository, scope } = await resolveScope(serviceSlug, bunshinId, actorUserId);
    const result = await repository.transitionSupport({
      scope,
      supportId: parsed.data.supportId,
      action: parsed.data.action,
      ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
      occurredAt: new Date(),
    });
    if (!result) throw new ApplicationError('CONFLICT', 'support status changed');
    return result;
  });
}
