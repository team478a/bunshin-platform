import 'server-only';
import {
  ArchiveBunshin,
  CreateBunshin,
  GetBunshin,
  ListBunshins,
  UpdateBunshinProfile,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

async function useCases() {
  const { PrismaBunshinRepository } = await import('@bunshin/database');
  const repository = new PrismaBunshinRepository();
  return {
    create: new CreateBunshin(repository),
    list: new ListBunshins(repository),
    get: new GetBunshin(repository),
    update: new UpdateBunshinProfile(repository),
    archive: new ArchiveBunshin(repository),
  };
}

const createSchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    type: z.enum(['COPY', 'EXPERT', 'BRAND', 'CHARACTER']),
    objectiveSummary: z.string(),
    audienceSummary: z.string(),
    personalitySummary: z.string(),
    avatarUrl: z.string().url().nullable().optional(),
  })
  .strict();

const updateSchema = z
  .object({
    name: z.string().optional(),
    objectiveSummary: z.string().optional(),
    audienceSummary: z.string().optional(),
    personalitySummary: z.string().optional(),
    avatarUrl: z.string().url().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

async function actorUserId(): Promise<string> {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return currentUser.userId;
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
    const result = await operation();
    return Response.json(
      { data: result, requestId },
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

export function listBunshinsResponse(request: Request, workspaceId: string) {
  return response(request, async () =>
    (await useCases()).list.execute({ workspaceId, actorUserId: await actorUserId() }),
  );
}

export function createBunshinResponse(request: Request, workspaceId: string) {
  return response(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      return (await useCases()).create.execute({
        name: parsed.data.name,
        slug: parsed.data.slug,
        type: parsed.data.type,
        objectiveSummary: parsed.data.objectiveSummary,
        audienceSummary: parsed.data.audienceSummary,
        personalitySummary: parsed.data.personalitySummary,
        ...(parsed.data.avatarUrl === undefined ? {} : { avatarUrl: parsed.data.avatarUrl }),
        workspaceId,
        actorUserId: await actorUserId(),
      });
    },
    201,
  );
}

export function getBunshinResponse(request: Request, workspaceId: string, bunshinId: string) {
  return response(request, async () =>
    (await useCases()).get.execute({ workspaceId, bunshinId, actorUserId: await actorUserId() }),
  );
}

export function updateBunshinResponse(request: Request, workspaceId: string, bunshinId: string) {
  return response(request, async () => {
    requireSameOrigin(request);
    const parsed = updateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    return (await useCases()).update.execute({
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
      ...(parsed.data.avatarUrl === undefined ? {} : { avatarUrl: parsed.data.avatarUrl }),
      workspaceId,
      bunshinId,
      actorUserId: await actorUserId(),
    });
  });
}

export function archiveBunshinResponse(request: Request, workspaceId: string, bunshinId: string) {
  return response(request, async () => {
    requireSameOrigin(request);
    if (
      request.headers.get('content-type')?.toLowerCase().startsWith('application/json') !== true
    ) {
      throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
    }
    return (await useCases()).archive.execute({
      workspaceId,
      bunshinId,
      actorUserId: await actorUserId(),
    });
  });
}
