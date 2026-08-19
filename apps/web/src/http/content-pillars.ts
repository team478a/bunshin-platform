import 'server-only';
import {
  ActivateContentPillar,
  CreateContentPillar,
  DeactivateContentPillar,
  DeleteContentPillar,
  GetContentPillar,
  ListContentPillars,
  UpdateContentPillar,
  type ContentPillar,
} from '@bunshin/capability-social';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const values = {
  title: z.string(),
  description: z.string().nullable().optional(),
  weight: z.number(),
};
const createSchema = z.object(values).strict();
const updateSchema = z
  .object({
    title: values.title.optional(),
    description: values.description,
    weight: values.weight.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const emptySchema = z.object({}).strict();
const uuidSchema = z.string().uuid();

async function actorUserId() {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return currentUser.userId;
}

async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  }
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function repositories() {
  const { PrismaBunshinCapabilityAssignmentRepository, PrismaContentPillarRepository } =
    await import('@bunshin/database');
  return {
    assignments: new PrismaBunshinCapabilityAssignmentRepository(),
    pillars: new PrismaContentPillarRepository(),
  };
}

export const contentPillarDto = (value: ContentPillar) => ({
  id: value.id,
  workspaceId: value.workspaceId,
  bunshinId: value.bunshinId,
  title: value.title,
  description: value.description,
  weight: value.weight,
  active: value.active,
  deletedAt: value.deletedAt?.toISOString() ?? null,
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

function pillarId(value: string) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid pillar id');
  return parsed.data;
}

export function listContentPillarsResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const { pillars } = await repositories();
    return (
      await new ListContentPillars(pillars).execute({
        workspaceId,
        bunshinId,
        actorUserId: await actorUserId(),
      })
    ).map(contentPillarDto);
  });
}

export function createContentPillarResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const { assignments, pillars } = await repositories();
      return contentPillarDto(
        await new CreateContentPillar(pillars, assignments).execute({
          title: parsed.data.title,
          weight: parsed.data.weight,
          ...(parsed.data.description === undefined
            ? {}
            : { description: parsed.data.description }),
          workspaceId,
          bunshinId,
          actorUserId: await actorUserId(),
        }),
      );
    },
    201,
  );
}

export function getContentPillarResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  id: string,
) {
  return respond(request, async () => {
    const { pillars } = await repositories();
    return contentPillarDto(
      await new GetContentPillar(pillars).execute({
        workspaceId,
        bunshinId,
        pillarId: pillarId(id),
        actorUserId: await actorUserId(),
      }),
    );
  });
}

export function updateContentPillarResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  id: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = updateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { assignments, pillars } = await repositories();
    return contentPillarDto(
      await new UpdateContentPillar(pillars, assignments).execute({
        ...(parsed.data.title === undefined ? {} : { title: parsed.data.title }),
        ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
        ...(parsed.data.weight === undefined ? {} : { weight: parsed.data.weight }),
        workspaceId,
        bunshinId,
        pillarId: pillarId(id),
        actorUserId: await actorUserId(),
      }),
    );
  });
}

export function setContentPillarActiveResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  id: string,
  active: boolean,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = emptySchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const { assignments, pillars } = await repositories();
    const input = {
      workspaceId,
      bunshinId,
      pillarId: pillarId(id),
      actorUserId: await actorUserId(),
    };
    return contentPillarDto(
      active
        ? await new ActivateContentPillar(pillars, assignments).execute(input)
        : await new DeactivateContentPillar(pillars, assignments).execute(input),
    );
  });
}

export function deleteContentPillarResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  id: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (request.body !== null)
      throw new ApplicationError('VALIDATION_ERROR', 'body is not allowed');
    const { assignments, pillars } = await repositories();
    return contentPillarDto(
      await new DeleteContentPillar(pillars, assignments).execute({
        workspaceId,
        bunshinId,
        pillarId: pillarId(id),
        actorUserId: await actorUserId(),
      }),
    );
  });
}
