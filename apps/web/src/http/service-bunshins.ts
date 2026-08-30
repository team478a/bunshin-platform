import 'server-only';
import {
  ArchiveBunshin,
  CreateBunshin,
  GetBunshin,
  ListServiceBunshins,
  UpdateBunshinProfile,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';

const createSchema = z
  .object({
    name: z.string().min(1).max(100),
    objectiveSummary: z.string().min(1).max(500),
    audienceSummary: z.string().min(1).max(500),
    personalitySummary: z.string().min(1).max(500),
  })
  .strict();

const updateSchema = createSchema.partial().refine((value) => Object.keys(value).length > 0);

async function actorUserId(): Promise<string> {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

async function useCases() {
  const db = await import('@bunshin/database');
  const repository = new db.PrismaBunshinRepository();
  return {
    archive: new ArchiveBunshin(repository),
    create: new CreateBunshin(repository),
    get: new GetBunshin(repository),
    list: new ListServiceBunshins(repository),
    update: new UpdateBunshinProfile(repository),
  };
}

async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  }
  try {
    return await request.json();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function response(request: Request, operation: () => Promise<unknown>, status = 200) {
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

export function listServiceBunshinsResponse(request: Request, serviceSlug: string) {
  return response(request, async () => {
    const [service, actor] = await Promise.all([
      resolvePublicServiceContext(serviceSlug),
      actorUserId(),
    ]);
    return (await useCases()).list.execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor,
    });
  });
}

export function createServiceBunshinResponse(request: Request, serviceSlug: string) {
  return response(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      const [service, actor] = await Promise.all([
        resolvePublicServiceContext(serviceSlug),
        actorUserId(),
      ]);
      return (await useCases()).create.execute({
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        actorUserId: actor,
        name: parsed.data.name,
        slug: `service-${crypto.randomUUID()}`,
        type: 'EXPERT',
        objectiveSummary: parsed.data.objectiveSummary,
        audienceSummary: parsed.data.audienceSummary,
        personalitySummary: parsed.data.personalitySummary,
      });
    },
    201,
  );
}

export function getServiceBunshinResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return response(request, async () => {
    const [service, actor] = await Promise.all([
      resolvePublicServiceContext(serviceSlug),
      actorUserId(),
    ]);
    return (await useCases()).get.execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      bunshinId,
      actorUserId: actor,
    });
  });
}

export function updateServiceBunshinResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return response(request, async () => {
    requireSameOrigin(request);
    const parsed = updateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const [service, actor] = await Promise.all([
      resolvePublicServiceContext(serviceSlug),
      actorUserId(),
    ]);
    return (await useCases()).update.execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      bunshinId,
      actorUserId: actor,
      ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
      ...(parsed.data.objectiveSummary === undefined
        ? {}
        : { objectiveSummary: parsed.data.objectiveSummary }),
      ...(parsed.data.audienceSummary === undefined
        ? {}
        : { audienceSummary: parsed.data.audienceSummary }),
      ...(parsed.data.personalitySummary === undefined
        ? {}
        : { personalitySummary: parsed.data.personalitySummary }),
    });
  });
}

export function archiveServiceBunshinResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return response(request, async () => {
    requireSameOrigin(request);
    await jsonBody(request);
    const [service, actor] = await Promise.all([
      resolvePublicServiceContext(serviceSlug),
      actorUserId(),
    ]);
    return (await useCases()).archive.execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      bunshinId,
      actorUserId: actor,
    });
  });
}
