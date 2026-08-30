import 'server-only';
import {
  ConfirmWeeklyPlan,
  ExpireWeeklyPlan,
  ListContentPillars,
  ListWeeklyPlans,
} from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';
import { createWeeklyPlanGenerationService } from '../services/weekly-plan-generation';
import { weeklyPlanDto } from './weekly-plans';

const uuidSchema = z.string().uuid();
const emptySchema = z.object({}).strict();
const generateSchema = z
  .object({ weekStartDate: z.string(), timezone: z.string(), socialProfileId: uuidSchema })
  .strict();

async function actorUserId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

async function body(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return await request.json();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

function resourceId(value: string) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid resource id');
  return parsed.data;
}

async function scope(serviceSlug: string, bunshinId: string) {
  const [service, actor] = await Promise.all([
    resolvePublicServiceContext(serviceSlug),
    actorUserId(),
  ]);
  return {
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    bunshinId,
    actorUserId: actor,
  };
}

async function repositories() {
  const db = await import('@bunshin/database');
  return {
    assignments: new db.PrismaBunshinCapabilityAssignmentRepository(),
    pillars: new db.PrismaContentPillarRepository(),
    plans: new db.PrismaWeeklyPlanRepository(),
  };
}

async function respond(
  request: Request,
  operation: () => Promise<unknown>,
  status = 200,
  suppliedRequestId?: string,
) {
  const requestId = suppliedRequestId ?? requestIdFromHeader(request.headers.get('x-request-id'));
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

async function values(serviceSlug: string, bunshinId: string) {
  const input = await scope(serviceSlug, bunshinId);
  const repositoriesValue = await repositories();
  const pillars = await new ListContentPillars(repositoriesValue.pillars).execute(input);
  return {
    input,
    ...repositoriesValue,
    titles: new Map(pillars.map(({ id, title }) => [id, title])),
  };
}

export function listServiceWeeklyPlansResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const { input, plans, titles } = await values(serviceSlug, bunshinId);
    return (await new ListWeeklyPlans(plans).execute(input)).map((plan) =>
      weeklyPlanDto(plan, titles),
    );
  });
}

export function generateServiceWeeklyPlanResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = generateSchema.safeParse(await body(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const input = await scope(serviceSlug, bunshinId);
      const result = await (
        await createWeeklyPlanGenerationService()
      ).execute({
        ...input,
        ...parsed.data,
        usageIdempotencyKey: `${requestId}:service-weekly-plan`,
        existingPolicy: 'CONFLICT',
        includeGrantedKnowledge: false,
        includeCampaigns: false,
      });
      return weeklyPlanDto(result.plan, result.titles);
    },
    201,
    requestId,
  );
}

export function setServiceWeeklyPlanStatusResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  weeklyPlanId: string,
  action: 'confirm' | 'expire',
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (!emptySchema.safeParse(await body(request)).success)
      throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const { input, assignments, plans, titles } = await values(serviceSlug, bunshinId);
    const commandInput = { ...input, weeklyPlanId: resourceId(weeklyPlanId) };
    const plan =
      action === 'confirm'
        ? await new ConfirmWeeklyPlan(plans, assignments).execute(commandInput)
        : await new ExpireWeeklyPlan(plans, assignments).execute(commandInput);
    return weeklyPlanDto(plan, titles);
  });
}
