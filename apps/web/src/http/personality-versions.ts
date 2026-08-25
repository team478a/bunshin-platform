import 'server-only';
import {
  CreatePersonalityVersion,
  ListPersonalityVersions,
  RestorePersonalityVersion,
  type BunshinPersonalityVersion,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const content = {
  tone: z.string(),
  formality: z.string(),
  energyLevel: z.string(),
  expertiseLevel: z.string(),
  sentenceStyle: z.string(),
  firstPerson: z.string(),
  forbiddenExpressions: z.array(z.string()),
  preferredExpressions: z.array(z.string()),
  visualDirection: z.string().nullable(),
  facePolicy: z.enum(['FACE_OK', 'FACE_NG_VOICE_OK', 'FACE_VOICE_NG', 'FULL_ANONYMOUS']),
};
const createSchema = z.object({ ...content, changeReason: z.string() }).strict();
const restoreSchema = z.object({ changeReason: z.string() }).strict();

async function actorUserId() {
  const current = await (await currentUserProvider()).getCurrentUser();
  if (!current) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return current.userId;
}

async function body(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function repository() {
  const { PrismaPersonalityVersionRepository } = await import('@bunshin/database');
  return new PrismaPersonalityVersionRepository();
}

const dto = (value: BunshinPersonalityVersion) => ({
  id: value.id,
  version: value.version,
  source: value.source,
  changeReason: value.changeReason,
  basedOnVersionId: value.basedOnVersionId,
  tone: value.tone,
  formality: value.formality,
  energyLevel: value.energyLevel,
  expertiseLevel: value.expertiseLevel,
  sentenceStyle: value.sentenceStyle,
  firstPerson: value.firstPerson,
  forbiddenExpressions: value.forbiddenExpressions,
  preferredExpressions: value.preferredExpressions,
  visualDirection: value.visualDirection,
  facePolicy: value.facePolicy,
  createdAt: value.createdAt,
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

export function listPersonalityVersionsResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(request, async () =>
    (
      await new ListPersonalityVersions(await repository()).execute({
        workspaceId,
        bunshinId,
        actorUserId: await actorUserId(),
      })
    ).map(dto),
  );
}

export function createPersonalityVersionResponse(
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
      const { changeReason, ...personality } = parsed.data;
      return dto(
        await new CreatePersonalityVersion(await repository()).execute({
          workspaceId,
          bunshinId,
          actorUserId: await actorUserId(),
          source: 'MANUAL',
          changeReason,
          content: personality,
        }),
      );
    },
    201,
  );
}

export function restorePersonalityVersionResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  versionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = restoreSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    return dto(
      await new RestorePersonalityVersion(await repository()).execute({
        workspaceId,
        bunshinId,
        versionId,
        actorUserId: await actorUserId(),
        changeReason: parsed.data.changeReason,
      }),
    );
  });
}
