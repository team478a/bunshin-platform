import 'server-only';
import { AdjustServiceCredits } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';
const body = z
  .object({
    membershipId: z.string().uuid(),
    amount: z
      .number()
      .int()
      .min(-100000)
      .max(100000)
      .refine((v) => v !== 0),
    reason: z.string().trim().min(1).max(1000),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

const bulkGrantBody = z
  .object({
    membershipIds: z.array(z.string().uuid()).min(1).max(200),
    amount: z.number().int().min(1).max(100000),
    reason: z.string().trim().min(1).max(1000),
    idempotencyKey: z.string().min(8).max(160),
  })
  .strict();
export async function adjustServiceCreditsResponse(request: Request, slug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, input] = await Promise.all([
      resolveManagedServiceContext(slug, actor.userId),
      body.parseAsync(await request.json()),
    ]);
    const db = await import('@bunshin/database');
    const value = await new AdjustServiceCredits(
      new db.PrismaServiceCreditAdjustmentRepository(),
    ).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      membershipId: input.membershipId,
      actorUserId: actor.userId,
      amount: input.amount,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
    return Response.json({ data: value, requestId }, { status: 201 });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function bulkGrantServiceCreditsResponse(request: Request, slug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, input] = await Promise.all([
      resolveManagedServiceContext(slug, actor.userId),
      bulkGrantBody.parseAsync(await request.json()),
    ]);
    const membershipIds = [...new Set(input.membershipIds)];
    const db = await import('@bunshin/database');
    const eligibleCount = await db.prisma.groupMembership.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        id: { in: membershipIds },
        status: 'ACTIVE',
        serviceRole: 'PARTICIPANT',
      },
    });
    if (eligibleCount !== membershipIds.length)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'one or more participants cannot receive credits',
      );
    const useCase = new AdjustServiceCredits(new db.PrismaServiceCreditAdjustmentRepository());
    const values = [];
    for (const membershipId of membershipIds) {
      values.push(
        await useCase.execute({
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          membershipId,
          actorUserId: actor.userId,
          amount: input.amount,
          reason: input.reason,
          idempotencyKey: `${input.idempotencyKey}:${membershipId}`,
        }),
      );
    }
    return Response.json({ data: { granted: values.length }, requestId }, { status: 201 });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}
