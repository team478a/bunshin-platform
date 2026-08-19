import 'server-only';
import {
  ApproveSocialAccountStrategy,
  CreateSocialAccountStrategy,
  ListSocialAccountStrategies,
  SOCIAL_ACCOUNT_STRATEGY_DESTINATIONS,
  SOCIAL_ACCOUNT_STRATEGY_GOALS,
  SOCIAL_PLATFORMS,
  type SocialAccountStrategy,
} from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const createSchema = z
  .object({
    socialProfileId: z.string().uuid(),
    platform: z.enum(SOCIAL_PLATFORMS),
    goal: z.enum(SOCIAL_ACCOUNT_STRATEGY_GOALS),
    availableMinutes: z.union([z.literal(3), z.literal(5), z.literal(10), z.literal(20)]),
    destinationType: z.enum(SOCIAL_ACCOUNT_STRATEGY_DESTINATIONS),
    destinationDetail: z.string().nullable().optional(),
    concept: z.string(),
    positioning: z.string(),
    targetSummary: z.string(),
    profileDraft: z.string(),
    ctaStrategy: z.string(),
    postingPolicy: z.string(),
  })
  .strict();
const approveSchema = z.object({}).strict();
async function actorUserId() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}
async function repositories() {
  const db = await import('@bunshin/database');
  return {
    strategies: new db.PrismaSocialAccountStrategyRepository(),
    assignments: new db.PrismaBunshinCapabilityAssignmentRepository(),
  };
}
const dto = (value: SocialAccountStrategy) => ({
  ...value,
  approvedAt: value.approvedAt?.toISOString() ?? null,
  supersededAt: value.supersededAt?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});
async function respond(request: Request, operation: () => Promise<unknown>, status = 200) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { status, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
export function listSocialAccountStrategiesResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  socialProfileId: string,
) {
  return respond(request, async () => {
    const { strategies } = await repositories();
    return (
      await new ListSocialAccountStrategies(strategies).execute({
        workspaceId,
        bunshinId,
        socialProfileId,
        actorUserId: await actorUserId(),
      })
    ).map(dto);
  });
}
export function createSocialAccountStrategyResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await body(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const { destinationDetail, ...values } = parsed.data;
      const { strategies, assignments } = await repositories();
      return dto(
        await new CreateSocialAccountStrategy(strategies, assignments).execute({
          ...values,
          ...(destinationDetail === undefined ? {} : { destinationDetail }),
          workspaceId,
          bunshinId,
          actorUserId: await actorUserId(),
          status: 'PROPOSED',
        }),
      );
    },
    201,
  );
}
export function approveSocialAccountStrategyResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  strategyId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (!approveSchema.safeParse(await body(request)).success)
      throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const { strategies, assignments } = await repositories();
    return dto(
      await new ApproveSocialAccountStrategy(strategies, assignments).execute({
        workspaceId,
        bunshinId,
        strategyId,
        actorUserId: await actorUserId(),
      }),
    );
  });
}
