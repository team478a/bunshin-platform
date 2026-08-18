import 'server-only';
import {
  CreateBunshinMemory,
  DeleteBunshinMemory,
  GetBunshinMemory,
  ListBunshinMemories,
  SetBunshinMemoryActive,
  UpdateBunshinMemory,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import type { BunshinMemory } from '@bunshin/platform-domain';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const types = [
  'BELIEF',
  'EXPERIENCE',
  'KNOWLEDGE',
  'STORY',
  'FAQ',
  'OPINION',
  'PREFERENCE',
  'PERFORMANCE_INSIGHT',
] as const;

const values = {
  type: z.enum(types),
  content: z.string(),
  summary: z.string().nullable().optional(),
  confidence: z.number(),
  importance: z.number(),
};
const createSchema = z.object(values).strict();
const updateSchema = z
  .object({
    type: values.type.optional(),
    content: values.content.optional(),
    summary: values.summary,
    confidence: values.confidence.optional(),
    importance: values.importance.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const emptySchema = z.object({}).strict();

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

async function repository() {
  const { PrismaBunshinMemoryRepository } = await import('@bunshin/database');
  return new PrismaBunshinMemoryRepository();
}

const dto = (value: BunshinMemory) => ({
  id: value.id,
  workspaceId: value.workspaceId,
  bunshinId: value.bunshinId,
  type: value.type,
  content: value.content,
  summary: value.summary,
  sourceType: value.sourceType,
  confidence: value.confidence,
  importance: value.importance,
  active: value.active,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
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

function normalizedSummary(value: string | null): string | null {
  if (value === null) return value;
  return value.trim().length === 0 ? null : value;
}

export function listMemoriesResponse(request: Request, workspaceId: string, bunshinId: string) {
  return respond(request, async () => {
    const status = new URL(request.url).searchParams.get('status');
    if (status !== null && status !== 'inactive') {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid status');
    }
    const inactive = status === 'inactive';
    const memories = await new ListBunshinMemories(await repository()).execute({
      workspaceId,
      bunshinId,
      actorUserId: await actorUserId(),
      includeInactive: inactive,
    });
    return memories.filter((memory) => memory.active !== inactive).map(dto);
  });
}

export function createMemoryResponse(request: Request, workspaceId: string, bunshinId: string) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      return dto(
        await new CreateBunshinMemory(await repository()).execute({
          type: parsed.data.type,
          content: parsed.data.content,
          confidence: parsed.data.confidence,
          importance: parsed.data.importance,
          ...(parsed.data.summary === undefined
            ? {}
            : { summary: normalizedSummary(parsed.data.summary) }),
          workspaceId,
          bunshinId,
          actorUserId: await actorUserId(),
        }),
      );
    },
    201,
  );
}

export function getMemoryResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  memoryId: string,
) {
  return respond(request, async () =>
    dto(
      await new GetBunshinMemory(await repository()).execute({
        workspaceId,
        bunshinId,
        memoryId,
        actorUserId: await actorUserId(),
      }),
    ),
  );
}

export function updateMemoryResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  memoryId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = updateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    return dto(
      await new UpdateBunshinMemory(await repository()).execute({
        ...(parsed.data.type === undefined ? {} : { type: parsed.data.type }),
        ...(parsed.data.content === undefined ? {} : { content: parsed.data.content }),
        ...(parsed.data.summary === undefined
          ? {}
          : { summary: normalizedSummary(parsed.data.summary) }),
        ...(parsed.data.confidence === undefined ? {} : { confidence: parsed.data.confidence }),
        ...(parsed.data.importance === undefined ? {} : { importance: parsed.data.importance }),
        workspaceId,
        bunshinId,
        memoryId,
        actorUserId: await actorUserId(),
      }),
    );
  });
}

export function setMemoryActiveResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  memoryId: string,
  active: boolean,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = emptySchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    return dto(
      await new SetBunshinMemoryActive(await repository()).execute({
        workspaceId,
        bunshinId,
        memoryId,
        active,
        actorUserId: await actorUserId(),
      }),
    );
  });
}

export function deleteMemoryResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  memoryId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (request.body !== null)
      throw new ApplicationError('VALIDATION_ERROR', 'body is not allowed');
    return dto(
      await new DeleteBunshinMemory(await repository()).execute({
        workspaceId,
        bunshinId,
        memoryId,
        actorUserId: await actorUserId(),
      }),
    );
  });
}
