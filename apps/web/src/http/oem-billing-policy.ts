import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const common = {
  workspaceId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.literal(true),
};
const date = z.string().datetime({ offset: true });
const schema = z.discriminatedUnion('operation', [
  z
    .object({
      ...common,
      operation: z.literal('SET_OFFERING'),
      groupId: z.string().uuid(),
      productPolicy: z.enum(['HASSY', 'MANABERU_STYLE']),
      classification: z.enum(['FREE', 'PAID', 'PAID_BUNDLE']),
      expectedCurrentId: z.string().uuid().nullable(),
    })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal('REVIEW_REGISTRATION'),
      groupMembershipId: z.string().uuid(),
      registeredAt: date,
    })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal('REVIEW_CONTRACT'),
      startsAt: date,
      endsAt: date.nullable(),
    })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal('SCHEDULE_CUTOVER'),
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      historyReviewed: z.literal(true),
    })
    .strict(),
]);

export async function oemBillingPolicyResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const db = await import('@bunshin/database');
    const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
      user.userId,
    );
    if (admin?.role !== 'SUPER_ADMIN')
      throw new ApplicationError('FORBIDDEN', 'SUPER_ADMIN required');
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', '操作内容と本人確認を確認してください');
    const value = parsed.data;
    const service = new db.PrismaOemBillingAdminService();
    const actorUserId = user.userId;
    const base = { workspaceId: value.workspaceId, actorUserId, reason: value.reason };
    const result =
      value.operation === 'SET_OFFERING'
        ? await service.setOffering({
            ...base,
            groupId: value.groupId,
            productPolicy: value.productPolicy,
            classification: value.classification,
            expectedCurrentId: value.expectedCurrentId,
          })
        : value.operation === 'REVIEW_REGISTRATION'
          ? await service.reviewInitialRegistration({
              ...base,
              groupMembershipId: value.groupMembershipId,
              registeredAt: new Date(value.registeredAt),
            })
          : value.operation === 'REVIEW_CONTRACT'
            ? await service.reviewContractPeriod({
                ...base,
                startsAt: new Date(value.startsAt),
                endsAt: value.endsAt ? new Date(value.endsAt) : null,
              })
            : await service.scheduleCutover({
                ...base,
                effectiveFrom: new Date(`${value.month}-01T00:00:00.000Z`),
                historyReviewed: value.historyReviewed,
              });
    return Response.json(
      { data: result, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const domainError =
      error instanceof Error && !(error instanceof ApplicationError)
        ? error.message.startsWith('SUPER_ADMIN')
          ? new ApplicationError('FORBIDDEN', '管理者権限を確認してください')
          : /REVIEW_REQUIRED|STALE_|ALREADY_EXISTS|REQUIRED|FORBIDDEN|IMMUTABLE|INVALID_|NOT_FOUND/.test(
                error.message,
              )
            ? new ApplicationError('CONFLICT', '履歴・商品区分・適用月を確認してください')
            : error
        : error;
    const mapped = toApiError(domainError, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
