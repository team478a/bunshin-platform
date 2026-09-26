import 'server-only';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { SOCIAL_ACTIVITY_SUPPORT_ACTIONS } from '@bunshin/capability-social';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';

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
  })
  .strict();

async function json(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function respond(request: Request, operation: () => Promise<unknown>) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

async function resolveScope(serviceSlug: string, bunshinId: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
  const db = await import('@bunshin/database');
  const [membership, bunshin] = await Promise.all([
    db.prisma.groupMembership.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: actor.userId,
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
    db.prisma.bunshin.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        id: bunshinId,
        ownerUserId: actor.userId,
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
      userId: actor.userId,
      bunshinId,
    },
  };
}

export function getServiceSocialActivityBarrierResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const { repository, scope } = await resolveScope(serviceSlug, bunshinId);
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
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = answerSchema.safeParse(await json(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { repository, scope } = await resolveScope(serviceSlug, bunshinId);
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
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = supportSchema.safeParse(await json(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { repository, scope } = await resolveScope(serviceSlug, bunshinId);
    const result = await repository.transitionSupport({
      scope,
      supportId: parsed.data.supportId,
      action: parsed.data.action,
      occurredAt: new Date(),
    });
    if (!result) throw new ApplicationError('CONFLICT', 'support status changed');
    return result;
  });
}
