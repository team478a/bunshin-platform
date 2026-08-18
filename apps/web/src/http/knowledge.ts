import 'server-only';
import {
  ArchiveOwnerKnowledge,
  CreateOwnerKnowledge,
  GetOwnerKnowledge,
  GrantKnowledgeToBunshin,
  ListGrantedKnowledgeForBunshin,
  ListOwnerKnowledge,
  RevokeKnowledgeFromBunshin,
  UpdateOwnerKnowledge,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import type { BunshinKnowledgeGrant, OwnerKnowledge } from '@bunshin/platform-domain';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const types = [
  'PROFILE',
  'EXPERIENCE',
  'SKILL',
  'PRODUCT',
  'FAQ',
  'CASE',
  'ASSET',
  'OTHER',
] as const;
const createSchema = z
  .object({ type: z.enum(types), title: z.string(), content: z.string() })
  .strict();
const updateSchema = z
  .object({
    type: z.enum(types).optional(),
    title: z.string().optional(),
    content: z.string().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}
async function emptyMutation(request: Request) {
  requireSameOrigin(request);
  const parsed = z
    .object({})
    .strict()
    .safeParse(await body(request));
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'empty JSON object required');
}
async function repositories() {
  const { PrismaOwnerKnowledgeRepository, PrismaKnowledgeGrantRepository } =
    await import('@bunshin/database');
  return {
    knowledge: new PrismaOwnerKnowledgeRepository(),
    grants: new PrismaKnowledgeGrantRepository(),
  };
}
const dto = (value: OwnerKnowledge) => ({
  id: value.id,
  workspaceId: value.workspaceId,
  type: value.type,
  title: value.title,
  content: value.content,
  sourceType: value.sourceType,
  status: value.status,
  archivedAt: value.archivedAt,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
});
const grantDto = (value: BunshinKnowledgeGrant) => ({
  id: value.id,
  workspaceId: value.workspaceId,
  bunshinId: value.bunshinId,
  ownerKnowledgeId: value.ownerKnowledgeId,
  status: value.status,
  grantedAt: value.grantedAt,
  revokedAt: value.revokedAt,
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

export const listKnowledgeResponse = (request: Request, workspaceId: string) =>
  respond(request, async () =>
    (
      await new ListOwnerKnowledge((await repositories()).knowledge).execute({
        workspaceId,
        actorUserId: await actor(),
      })
    ).map(dto),
  );
export const createKnowledgeResponse = (request: Request, workspaceId: string) =>
  respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await body(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      return dto(
        await new CreateOwnerKnowledge((await repositories()).knowledge).execute({
          ...parsed.data,
          workspaceId,
          actorUserId: await actor(),
        }),
      );
    },
    201,
  );
export const getKnowledgeResponse = (request: Request, workspaceId: string, knowledgeId: string) =>
  respond(request, async () =>
    dto(
      await new GetOwnerKnowledge((await repositories()).knowledge).execute({
        workspaceId,
        knowledgeId,
        actorUserId: await actor(),
      }),
    ),
  );
export const updateKnowledgeResponse = (
  request: Request,
  workspaceId: string,
  knowledgeId: string,
) =>
  respond(request, async () => {
    requireSameOrigin(request);
    const parsed = updateSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    return dto(
      await new UpdateOwnerKnowledge((await repositories()).knowledge).execute({
        ...(parsed.data.type === undefined ? {} : { type: parsed.data.type }),
        ...(parsed.data.title === undefined ? {} : { title: parsed.data.title }),
        ...(parsed.data.content === undefined ? {} : { content: parsed.data.content }),
        workspaceId,
        knowledgeId,
        actorUserId: await actor(),
      }),
    );
  });
export const archiveKnowledgeResponse = (
  request: Request,
  workspaceId: string,
  knowledgeId: string,
) =>
  respond(request, async () => {
    await emptyMutation(request);
    return dto(
      await new ArchiveOwnerKnowledge((await repositories()).knowledge).execute({
        workspaceId,
        knowledgeId,
        actorUserId: await actor(),
      }),
    );
  });
export const listGrantedKnowledgeResponse = (
  request: Request,
  workspaceId: string,
  bunshinId: string,
) =>
  respond(request, async () =>
    (
      await new ListGrantedKnowledgeForBunshin((await repositories()).grants).execute({
        workspaceId,
        bunshinId,
        actorUserId: await actor(),
      })
    ).map(dto),
  );
export const grantKnowledgeResponse = (
  request: Request,
  workspaceId: string,
  bunshinId: string,
  knowledgeId: string,
) =>
  respond(request, async () => {
    await emptyMutation(request);
    const value = await new GrantKnowledgeToBunshin((await repositories()).grants).execute({
      workspaceId,
      bunshinId,
      knowledgeId,
      actorUserId: await actor(),
    });
    return grantDto(value);
  });
export const revokeKnowledgeResponse = (
  request: Request,
  workspaceId: string,
  bunshinId: string,
  knowledgeId: string,
) =>
  respond(request, async () => {
    await emptyMutation(request);
    const value = await new RevokeKnowledgeFromBunshin((await repositories()).grants).execute({
      workspaceId,
      bunshinId,
      knowledgeId,
      actorUserId: await actor(),
    });
    return grantDto(value);
  });
