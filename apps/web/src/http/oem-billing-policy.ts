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
const productKey = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,39}$/);
const capabilityKey = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,79}$/);
const date = z.string().datetime({ offset: true });
const schema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('REGISTER_PRODUCT_POLICY'),
      key: productKey,
      displayName: z.string().trim().min(1).max(120),
      freeOfferingAllowed: z.boolean(),
      requiredCapabilities: z.array(capabilityKey).max(20),
      effectiveFrom: z.string().date(),
      reason: z.string().trim().min(1).max(1000),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal('SET_OFFERING'),
      groupId: z.string().uuid(),
      productPolicy: productKey,
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
      operation: z.literal('CORRECT_OFFERING'),
      offeringPeriodId: z.string().uuid(),
      expectedStartsAt: date,
      expectedEndsAt: date.nullable(),
      expectedClassification: z.enum(['FREE', 'PAID', 'PAID_BUNDLE']),
      revisedStartsAt: date,
      revisedEndsAt: date.nullable(),
      revisedClassification: z.enum(['FREE', 'PAID', 'PAID_BUNDLE']),
    })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal('CORRECT_REGISTRATION'),
      registrationPeriodId: z.string().uuid(),
      expectedStartsAt: date,
      expectedEndsAt: date.nullable(),
      revisedStartsAt: date,
      revisedEndsAt: date.nullable(),
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
      operation: z.literal('CORRECT_CONTRACT'),
      contractPeriodId: z.string().uuid(),
      expectedStartsAt: date,
      expectedEndsAt: date.nullable(),
      revisedStartsAt: date,
      revisedEndsAt: date.nullable(),
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
  z
    .object({
      ...common,
      operation: z.literal('CORRECT_CUTOVER'),
      expectedEffectiveFrom: date.nullable(),
      revisedMonth: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .nullable(),
      historyReviewed: z.boolean(),
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
    const result =
      value.operation === 'REGISTER_PRODUCT_POLICY'
        ? await service.registerProductPolicy({
            key: value.key,
            displayName: value.displayName,
            freeOfferingAllowed: value.freeOfferingAllowed,
            requiredCapabilities: value.requiredCapabilities,
            effectiveFrom: new Date(`${value.effectiveFrom}T00:00:00.000Z`),
            actorUserId,
            reason: value.reason,
          })
        : value.operation === 'SET_OFFERING'
          ? await service.setOffering({
              workspaceId: value.workspaceId,
              actorUserId,
              reason: value.reason,
              groupId: value.groupId,
              productPolicy: value.productPolicy,
              classification: value.classification,
              expectedCurrentId: value.expectedCurrentId,
            })
          : value.operation === 'CORRECT_OFFERING'
            ? await service.correctOfferingPeriod({
                workspaceId: value.workspaceId,
                offeringPeriodId: value.offeringPeriodId,
                expectedStartsAt: new Date(value.expectedStartsAt),
                expectedEndsAt: value.expectedEndsAt ? new Date(value.expectedEndsAt) : null,
                expectedClassification: value.expectedClassification,
                revisedStartsAt: new Date(value.revisedStartsAt),
                revisedEndsAt: value.revisedEndsAt ? new Date(value.revisedEndsAt) : null,
                revisedClassification: value.revisedClassification,
                actorUserId,
                reason: value.reason,
                confirmed: value.confirmed,
              })
            : value.operation === 'REVIEW_REGISTRATION'
              ? await service.reviewInitialRegistration({
                  workspaceId: value.workspaceId,
                  actorUserId,
                  reason: value.reason,
                  groupMembershipId: value.groupMembershipId,
                  registeredAt: new Date(value.registeredAt),
                })
              : value.operation === 'CORRECT_REGISTRATION'
                ? await service.correctRegistrationPeriod({
                    workspaceId: value.workspaceId,
                    registrationPeriodId: value.registrationPeriodId,
                    expectedStartsAt: new Date(value.expectedStartsAt),
                    expectedEndsAt: value.expectedEndsAt ? new Date(value.expectedEndsAt) : null,
                    revisedStartsAt: new Date(value.revisedStartsAt),
                    revisedEndsAt: value.revisedEndsAt ? new Date(value.revisedEndsAt) : null,
                    actorUserId,
                    reason: value.reason,
                    confirmed: value.confirmed,
                  })
                : value.operation === 'REVIEW_CONTRACT'
                  ? await service.reviewContractPeriod({
                      workspaceId: value.workspaceId,
                      actorUserId,
                      reason: value.reason,
                      startsAt: new Date(value.startsAt),
                      endsAt: value.endsAt ? new Date(value.endsAt) : null,
                    })
                  : value.operation === 'CORRECT_CONTRACT'
                    ? await service.correctContractPeriod({
                        workspaceId: value.workspaceId,
                        contractPeriodId: value.contractPeriodId,
                        expectedStartsAt: new Date(value.expectedStartsAt),
                        expectedEndsAt: value.expectedEndsAt
                          ? new Date(value.expectedEndsAt)
                          : null,
                        revisedStartsAt: new Date(value.revisedStartsAt),
                        revisedEndsAt: value.revisedEndsAt ? new Date(value.revisedEndsAt) : null,
                        actorUserId,
                        reason: value.reason,
                        confirmed: value.confirmed,
                      })
                    : value.operation === 'SCHEDULE_CUTOVER'
                      ? await service.scheduleCutover({
                          workspaceId: value.workspaceId,
                          actorUserId,
                          reason: value.reason,
                          effectiveFrom: new Date(`${value.month}-01T00:00:00.000Z`),
                          historyReviewed: value.historyReviewed,
                        })
                      : await service.correctCutover({
                          workspaceId: value.workspaceId,
                          expectedEffectiveFrom: value.expectedEffectiveFrom
                            ? new Date(value.expectedEffectiveFrom)
                            : null,
                          revisedEffectiveFrom: value.revisedMonth
                            ? new Date(`${value.revisedMonth}-01T00:00:00.000Z`)
                            : null,
                          actorUserId,
                          reason: value.reason,
                          historyReviewed: value.historyReviewed,
                          confirmed: value.confirmed,
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
            ? new ApplicationError('CONFLICT', '履歴・商品ポリシー・適用月を確認してください')
            : error
        : error;
    const mapped = toApiError(domainError, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
