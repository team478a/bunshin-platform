import 'server-only';

import { ServiceReferralRewardRuleService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';

const input = z
  .object({
    ruleKey: z.enum(['onboarding-completed', 'first-post-reported']),
    milestone: z.enum(['ONBOARDING_COMPLETED', 'FIRST_POST_REPORTED']),
    recipient: z.enum(['REFERRER', 'REFERRED']),
    creditAmount: z.number().int().min(1).max(100_000),
    expiresAfterDays: z.number().int().min(1).max(3_650).nullable(),
    monthlyGrantLimit: z.number().int().min(1).max(100_000).nullable(),
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    const expectedKey =
      value.milestone === 'ONBOARDING_COMPLETED' ? 'onboarding-completed' : 'first-post-reported';
    if (value.ruleKey !== expectedKey)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ruleKey'],
        message: '紹介特典の種類が一致しません。',
      });
  });

export async function saveServiceReferralRewardRuleResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, value] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      input.parseAsync(await request.json()),
    ]);
    const db = await import('@bunshin/database');
    const saved = await new ServiceReferralRewardRuleService(
      new db.PrismaServiceReferralRewardRuleRepository(),
    ).save({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      status: value.enabled ? 'ACTIVE' : 'SUSPENDED',
      rule: {
        ruleKey: value.ruleKey,
        milestone: value.milestone,
        recipient: value.recipient,
        creditAmount: value.creditAmount,
        expiresAfterDays: value.expiresAfterDays,
        monthlyGrantLimit: value.monthlyGrantLimit,
      },
    });
    return Response.json(
      { data: saved, requestId },
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
