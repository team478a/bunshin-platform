import 'server-only';

import {
  DAILY_ACTION_KINDS,
  DailyActionService,
  type DailyActionRecord,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { DailyActionStorage } from '../daily-action-storage';
import { resolvePublicServiceContext } from '../services/public-service';

const uuid = z.string().uuid();
const inputSchema = z
  .object({
    kind: z.enum(DAILY_ACTION_KINDS),
    content: z.string().max(20_000),
    idempotencyKey: uuid,
    dailyMissionId: uuid.nullable(),
  })
  .strict();

type Scope = {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  groupId?: string;
};

const dto = (value: DailyActionRecord) => ({
  id: value.id,
  kind: value.kind,
  title: value.title,
  content: value.content,
  ownerKnowledgeId: value.ownerKnowledgeId,
  dailyMissionId: value.dailyMissionId,
  hasAsset: value.assetStorageKey !== null,
  assetMimeType: value.assetMimeType,
  assetOriginalFilename: value.assetOriginalFilename,
  assetSizeBytes: value.assetSizeBytes,
  createdAt: value.createdAt.toISOString(),
});

async function actorUserId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

async function repositories() {
  const db = await import('@bunshin/database');
  const repository = new db.PrismaDailyActionRepository();
  return { repository, service: new DailyActionService(repository) };
}

async function respond(request: Request, operation: () => Promise<unknown>, status = 200) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { status, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

async function formInput(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('multipart/form-data'))
    throw new ApplicationError('VALIDATION_ERROR', 'multipart/form-data is required');
  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid form data', error);
  }
  const string = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value : '';
  };
  const parsed = inputSchema.safeParse({
    kind: string('kind'),
    content: string('content'),
    idempotencyKey: string('idempotencyKey'),
    dailyMissionId: string('dailyMissionId') || null,
  });
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid daily action');
  const fileValue = form.get('file');
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  const needsFile = parsed.data.kind === 'PHOTO' || parsed.data.kind === 'VOICE_MEMO';
  if (needsFile !== Boolean(file))
    throw new ApplicationError(
      'VALIDATION_ERROR',
      needsFile ? '素材ファイルを選んでください' : 'この記録にファイルは追加できません',
    );
  return { ...parsed.data, file };
}

export function listDailyActionsResponse(request: Request, scopeInput: Scope | Promise<Scope>) {
  return respond(request, async () => {
    const scope = await scopeInput;
    const { service } = await repositories();
    return (await service.list({ ...scope, limit: 20 })).map(dto);
  });
}

export function createDailyActionResponse(request: Request, scopeInput: Scope | Promise<Scope>) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const scope = await scopeInput;
      const parsed = await formInput(request);
      const { service } = await repositories();
      const existing = await service.findByIdempotency({
        ...scope,
        idempotencyKey: parsed.idempotencyKey,
      });
      if (existing) return dto(existing);
      let uploaded: Awaited<ReturnType<DailyActionStorage['upload']>> | null = null;
      const storage = parsed.file ? new DailyActionStorage() : null;
      try {
        if (parsed.file && storage) {
          uploaded = await storage.upload({
            ...scope,
            idempotencyKey: parsed.idempotencyKey,
            kind: parsed.kind as 'PHOTO' | 'VOICE_MEMO',
            file: parsed.file,
          });
        }
        return dto(
          await service.create({
            ...scope,
            kind: parsed.kind,
            content: parsed.content,
            idempotencyKey: parsed.idempotencyKey,
            dailyMissionId: parsed.dailyMissionId,
            assetStorageKey: uploaded?.storageKey ?? null,
            assetMimeType: uploaded?.mimeType ?? null,
            assetOriginalFilename: uploaded?.originalFilename ?? null,
            assetSizeBytes: uploaded?.sizeBytes ?? null,
          }),
        );
      } catch (error) {
        if (uploaded && storage) await storage.remove(uploaded.storageKey);
        throw error;
      }
    },
    201,
  );
}

function dailyActionAssetResponse(
  request: Request,
  scopeInput: Scope | Promise<Scope>,
  dailyActionId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  return (async () => {
    try {
      const scope = await scopeInput;
      const { service } = await repositories();
      const action = await service.find({ ...scope, dailyActionId });
      if (!action.assetStorageKey || !action.assetMimeType || !action.assetOriginalFilename)
        throw new ApplicationError('NOT_FOUND', 'daily action asset unavailable');
      const bytes = await new DailyActionStorage().download(action.assetStorageKey);
      return new Response(Buffer.from(bytes), {
        headers: {
          'content-type': action.assetMimeType,
          'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(action.assetOriginalFilename)}`,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (error) {
      const mapped = toApiError(error, requestId);
      return Response.json(mapped.body, {
        status: mapped.status,
        headers: { 'cache-control': 'private, no-store' },
      });
    }
  })();
}

async function workspaceScope(workspaceId: string, bunshinId: string): Promise<Scope> {
  return {
    workspaceId: uuid.parse(workspaceId),
    bunshinId: uuid.parse(bunshinId),
    actorUserId: await actorUserId(),
  };
}

async function serviceScope(serviceSlug: string, bunshinId: string): Promise<Scope> {
  const [service, actor] = await Promise.all([
    resolvePublicServiceContext(serviceSlug),
    actorUserId(),
  ]);
  return {
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    bunshinId: uuid.parse(bunshinId),
    actorUserId: actor,
  };
}

export function listWorkspaceDailyActionsResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return listDailyActionsResponse(request, workspaceScope(workspaceId, bunshinId));
}
export function createWorkspaceDailyActionResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return createDailyActionResponse(request, workspaceScope(workspaceId, bunshinId));
}
export function getWorkspaceDailyActionAssetResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  dailyActionId: string,
) {
  return dailyActionAssetResponse(request, workspaceScope(workspaceId, bunshinId), dailyActionId);
}
export function listServiceDailyActionsResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return listDailyActionsResponse(request, serviceScope(serviceSlug, bunshinId));
}
export function createServiceDailyActionResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return createDailyActionResponse(request, serviceScope(serviceSlug, bunshinId));
}
export function getServiceDailyActionAssetResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyActionId: string,
) {
  return dailyActionAssetResponse(request, serviceScope(serviceSlug, bunshinId), dailyActionId);
}
