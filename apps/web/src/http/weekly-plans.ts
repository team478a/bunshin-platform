import 'server-only';
import {
  ConfirmWeeklyPlan,
  CreateWeeklyPlan,
  CreateWeeklyPlanItem,
  ExpireWeeklyPlan,
  GetWeeklyPlan,
  ListContentPillars,
  ListWeeklyPlans,
  RemoveWeeklyPlanItem,
  SOCIAL_PREFERRED_FORMATS,
  UpdateWeeklyPlan,
  UpdateWeeklyPlanItem,
  type ContentPillarRepository,
  type WeeklyPlan,
} from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuidSchema = z.string().uuid();
const planCreateSchema = z
  .object({
    weekStartDate: z.string(),
    timezone: z.string(),
    strategySummary: z.string().nullable().optional(),
  })
  .strict();
const planUpdateSchema = z.object({ strategySummary: z.string().nullable() }).strict();
const itemValues = {
  scheduledDate: z.string(),
  contentPillarId: uuidSchema,
  goal: z.string(),
  angle: z.string(),
  recommendedFormat: z.enum(SOCIAL_PREFERRED_FORMATS),
  notes: z.string().nullable().optional(),
};
const itemCreateSchema = z.object(itemValues).strict();
const itemUpdateSchema = z
  .object({
    scheduledDate: itemValues.scheduledDate.optional(),
    contentPillarId: itemValues.contentPillarId.optional(),
    goal: itemValues.goal.optional(),
    angle: itemValues.angle.optional(),
    recommendedFormat: itemValues.recommendedFormat.optional(),
    notes: itemValues.notes,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const emptySchema = z.object({}).strict();

async function actorUserId() {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return currentUser.userId;
}

async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function repositories() {
  const {
    PrismaBunshinCapabilityAssignmentRepository,
    PrismaContentPillarRepository,
    PrismaWeeklyPlanRepository,
  } = await import('@bunshin/database');
  return {
    assignments: new PrismaBunshinCapabilityAssignmentRepository(),
    pillars: new PrismaContentPillarRepository(),
    plans: new PrismaWeeklyPlanRepository(),
  };
}

function resourceId(value: string, name: string) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', `invalid ${name}`);
  return parsed.data;
}

async function pillarTitles(
  pillars: ContentPillarRepository,
  scope: { workspaceId: string; bunshinId: string; actorUserId: string },
) {
  const values = await new ListContentPillars(pillars).execute(scope);
  return new Map(values.map((value) => [value.id, value.title]));
}

export const weeklyPlanDto = (value: WeeklyPlan, titles: Map<string, string>) => ({
  id: value.id,
  workspaceId: value.workspaceId,
  bunshinId: value.bunshinId,
  weekStartDate: value.weekStartDate,
  timezone: value.timezone,
  strategySummary: value.strategySummary,
  status: value.status,
  confirmedAt: value.confirmedAt?.toISOString() ?? null,
  expiredAt: value.expiredAt?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
  items: value.items.map((item) => ({
    id: item.id,
    workspaceId: item.workspaceId,
    bunshinId: item.bunshinId,
    weeklyPlanId: item.weeklyPlanId,
    scheduledDate: item.scheduledDate,
    contentPillarId: item.contentPillarId,
    contentPillarTitle: titles.get(item.contentPillarId) ?? '利用できないContent Pillar',
    goal: item.goal,
    angle: item.angle,
    recommendedFormat: item.recommendedFormat,
    notes: item.notes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  })),
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

async function context(workspaceId: string, bunshinId: string) {
  const actor = await actorUserId();
  const values = await repositories();
  const scope = { workspaceId, bunshinId, actorUserId: actor };
  return { ...values, scope, titles: await pillarTitles(values.pillars, scope) };
}

export function listWeeklyPlansResponse(request: Request, workspaceId: string, bunshinId: string) {
  return respond(request, async () => {
    const { plans, scope, titles } = await context(workspaceId, bunshinId);
    return (await new ListWeeklyPlans(plans).execute(scope)).map((value) =>
      weeklyPlanDto(value, titles),
    );
  });
}

export function createWeeklyPlanResponse(request: Request, workspaceId: string, bunshinId: string) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = planCreateSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const { assignments, plans, scope, titles } = await context(workspaceId, bunshinId);
      return weeklyPlanDto(
        await new CreateWeeklyPlan(plans, assignments).execute({
          ...scope,
          weekStartDate: parsed.data.weekStartDate,
          timezone: parsed.data.timezone,
          ...(parsed.data.strategySummary === undefined
            ? {}
            : { strategySummary: parsed.data.strategySummary }),
        }),
        titles,
      );
    },
    201,
  );
}

export function getWeeklyPlanResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  id: string,
) {
  return respond(request, async () => {
    const { plans, scope, titles } = await context(workspaceId, bunshinId);
    return weeklyPlanDto(
      await new GetWeeklyPlan(plans).execute({ ...scope, weeklyPlanId: resourceId(id, 'plan id') }),
      titles,
    );
  });
}

export function updateWeeklyPlanResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  id: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = planUpdateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { assignments, plans, scope, titles } = await context(workspaceId, bunshinId);
    return weeklyPlanDto(
      await new UpdateWeeklyPlan(plans, assignments).execute({
        ...scope,
        weeklyPlanId: resourceId(id, 'plan id'),
        ...parsed.data,
      }),
      titles,
    );
  });
}

export function createWeeklyPlanItemResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  id: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = itemCreateSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const { assignments, plans, scope, titles } = await context(workspaceId, bunshinId);
      return weeklyPlanDto(
        await new CreateWeeklyPlanItem(plans, assignments).execute({
          ...scope,
          weeklyPlanId: resourceId(id, 'plan id'),
          scheduledDate: parsed.data.scheduledDate,
          contentPillarId: parsed.data.contentPillarId,
          goal: parsed.data.goal,
          angle: parsed.data.angle,
          recommendedFormat: parsed.data.recommendedFormat,
          ...(parsed.data.notes === undefined ? {} : { notes: parsed.data.notes }),
        }),
        titles,
      );
    },
    201,
  );
}

export function updateWeeklyPlanItemResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  planId: string,
  itemId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = itemUpdateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { assignments, plans, scope, titles } = await context(workspaceId, bunshinId);
    return weeklyPlanDto(
      await new UpdateWeeklyPlanItem(plans, assignments).execute({
        ...scope,
        weeklyPlanId: resourceId(planId, 'plan id'),
        itemId: resourceId(itemId, 'item id'),
        ...(parsed.data.scheduledDate === undefined
          ? {}
          : { scheduledDate: parsed.data.scheduledDate }),
        ...(parsed.data.contentPillarId === undefined
          ? {}
          : { contentPillarId: parsed.data.contentPillarId }),
        ...(parsed.data.goal === undefined ? {} : { goal: parsed.data.goal }),
        ...(parsed.data.angle === undefined ? {} : { angle: parsed.data.angle }),
        ...(parsed.data.recommendedFormat === undefined
          ? {}
          : { recommendedFormat: parsed.data.recommendedFormat }),
        ...(parsed.data.notes === undefined ? {} : { notes: parsed.data.notes }),
      }),
      titles,
    );
  });
}

export function deleteWeeklyPlanItemResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  planId: string,
  itemId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (request.body !== null)
      throw new ApplicationError('VALIDATION_ERROR', 'body is not allowed');
    const { assignments, plans, scope, titles } = await context(workspaceId, bunshinId);
    return weeklyPlanDto(
      await new RemoveWeeklyPlanItem(plans, assignments).execute({
        ...scope,
        weeklyPlanId: resourceId(planId, 'plan id'),
        itemId: resourceId(itemId, 'item id'),
      }),
      titles,
    );
  });
}

export function setWeeklyPlanStatusResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  id: string,
  action: 'confirm' | 'expire',
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = emptySchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const { assignments, plans, scope, titles } = await context(workspaceId, bunshinId);
    const input = { ...scope, weeklyPlanId: resourceId(id, 'plan id') };
    const value =
      action === 'confirm'
        ? await new ConfirmWeeklyPlan(plans, assignments).execute(input)
        : await new ExpireWeeklyPlan(plans, assignments).execute(input);
    return weeklyPlanDto(value, titles);
  });
}
