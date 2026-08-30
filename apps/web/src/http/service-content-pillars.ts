import 'server-only';
import { AssignCapabilityToBunshin } from '@bunshin/application';
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
import { resolvePublicServiceContext } from '../services/public-service';

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
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return await request.json();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function repositories() {
  const db = await import('@bunshin/database');
  return {
    assignments: new db.PrismaBunshinCapabilityAssignmentRepository(),
    pillars: new db.PrismaContentPillarRepository(),
  };
}

const dto = (value: ContentPillar) => ({
  id: value.id,
  title: value.title,
  description: value.description,
  weight: value.weight,
  active: value.active,
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

function pillarId(value: string) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid pillar id');
  return parsed.data;
}

export function listServiceContentPillarsResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const input = await scope(serviceSlug, bunshinId);
    const { pillars } = await repositories();
    return (await new ListContentPillars(pillars).execute(input)).map(dto);
  });
}

export function createServiceContentPillarResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const input = await scope(serviceSlug, bunshinId);
      const { assignments, pillars } = await repositories();
      await new AssignCapabilityToBunshin(assignments).execute({
        ...input,
        capabilityType: 'SOCIAL',
      });
      return dto(
        await new CreateContentPillar(pillars, assignments).execute({
          ...input,
          title: parsed.data.title,
          weight: parsed.data.weight,
          ...(parsed.data.description === undefined
            ? {}
            : { description: parsed.data.description }),
        }),
      );
    },
    201,
  );
}

export function getServiceContentPillarResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  id: string,
) {
  return respond(request, async () => {
    const input = await scope(serviceSlug, bunshinId);
    const { pillars } = await repositories();
    return dto(await new GetContentPillar(pillars).execute({ ...input, pillarId: pillarId(id) }));
  });
}

export function updateServiceContentPillarResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  id: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = updateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const input = await scope(serviceSlug, bunshinId);
    const { assignments, pillars } = await repositories();
    return dto(
      await new UpdateContentPillar(pillars, assignments).execute({
        ...input,
        pillarId: pillarId(id),
        ...(parsed.data.title === undefined ? {} : { title: parsed.data.title }),
        ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
        ...(parsed.data.weight === undefined ? {} : { weight: parsed.data.weight }),
      }),
    );
  });
}

export function setServiceContentPillarActiveResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  id: string,
  active: boolean,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (!emptySchema.safeParse(await jsonBody(request)).success)
      throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const input = { ...(await scope(serviceSlug, bunshinId)), pillarId: pillarId(id) };
    const { assignments, pillars } = await repositories();
    return dto(
      active
        ? await new ActivateContentPillar(pillars, assignments).execute(input)
        : await new DeactivateContentPillar(pillars, assignments).execute(input),
    );
  });
}

export function deleteServiceContentPillarResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  id: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (request.body !== null)
      throw new ApplicationError('VALIDATION_ERROR', 'body is not allowed');
    const input = { ...(await scope(serviceSlug, bunshinId)), pillarId: pillarId(id) };
    const { assignments, pillars } = await repositories();
    return dto(await new DeleteContentPillar(pillars, assignments).execute(input));
  });
}
