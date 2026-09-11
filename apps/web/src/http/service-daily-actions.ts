import 'server-only';
import { randomUUID } from 'node:crypto';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  DAILY_ACTION_PHOTO_MAX_BYTES,
  DailyActionStorage,
} from '../daily-actions/daily-action-storage';
import { resolvePublicServiceContext } from '../services/public-service';

export const DAILY_ACTION_TYPES = [
  'PHOTO',
  'CUSTOMER_QUESTION',
  'VOICE_MEMO',
  'COMMENT_REPLY',
  'POST_IMPROVEMENT',
  'REST_REASON',
] as const;
export type DailyActionType = (typeof DAILY_ACTION_TYPES)[number];

const uuid = z.string().uuid();
const common = {
  type: z.enum(DAILY_ACTION_TYPES),
  text: z.string().trim().min(2).max(1000),
  idempotencyKey: uuid,
};
const createSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...common,
      type: z.literal('PHOTO'),
      originalFilename: z.string().trim().min(1).max(255),
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      sizeBytes: z.number().int().positive().max(DAILY_ACTION_PHOTO_MAX_BYTES),
      rightsConfirmed: z.literal(true),
    })
    .strict(),
  ...DAILY_ACTION_TYPES.filter((type) => type !== 'PHOTO').map((type) =>
    z.object({ ...common, type: z.literal(type) }).strict(),
  ),
]);

const typeDetails: Record<
  DailyActionType,
  {
    memoryType: 'EXPERIENCE' | 'FAQ' | 'OPINION' | 'PERFORMANCE_INSIGHT' | 'PREFERENCE';
    label: string;
  }
> = {
  PHOTO: { memoryType: 'EXPERIENCE', label: '今日撮った写真' },
  CUSTOMER_QUESTION: { memoryType: 'FAQ', label: 'お客様から聞かれた質問' },
  VOICE_MEMO: { memoryType: 'EXPERIENCE', label: '30秒メモ' },
  COMMENT_REPLY: { memoryType: 'OPINION', label: 'コメントへの返信' },
  POST_IMPROVEMENT: { memoryType: 'PERFORMANCE_INSIGHT', label: '過去投稿の改善案' },
  REST_REASON: { memoryType: 'PREFERENCE', label: '今日は投稿しない理由' },
};

async function actionScope(serviceSlug: string, bunshinId: string) {
  const [service, actor] = await Promise.all([
    resolvePublicServiceContext(serviceSlug),
    (await currentUserProvider()).getCurrentUser(),
  ]);
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  const bunshin = await db.prisma.bunshin.findFirst({
    where: {
      id: uuid.parse(bunshinId),
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: actor.userId,
      status: { not: 'ARCHIVED' },
      group: {
        status: 'ACTIVE',
        memberships: {
          some: { userId: actor.userId, status: 'ACTIVE', consentedAt: { not: null } },
        },
      },
    },
    select: { id: true },
  });
  if (!bunshin) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
  return {
    db,
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
  };
}

function actionType(sourceId: string | null): DailyActionType | null {
  const value = sourceId?.split(':')[1];
  return DAILY_ACTION_TYPES.includes(value as DailyActionType) ? (value as DailyActionType) : null;
}

function actionDto(value: {
  id: string;
  content: string;
  summary: string | null;
  sourceId: string | null;
  attachmentStatus: 'PENDING_UPLOAD' | 'READY' | 'REJECTED' | null;
  createdAt: Date;
}) {
  const type = actionType(value.sourceId);
  if (!type) throw new ApplicationError('INTERNAL_ERROR', 'invalid daily action');
  return {
    id: value.id,
    type,
    text: value.content,
    label: typeDetails[type].label,
    hasPhoto: value.attachmentStatus === 'READY',
    attachmentStatus: value.attachmentStatus,
    createdAt: value.createdAt,
  };
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

async function json(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  return request
    .json()
    .then((value: unknown) => value)
    .catch((error: unknown) => {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
    });
}

export function listServiceDailyActionsResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const scope = await actionScope(serviceSlug, bunshinId);
    const rows = await scope.db.prisma.bunshinMemory.findMany({
      where: {
        workspaceId: scope.workspaceId,
        bunshinId,
        sourceType: 'USER_INPUT',
        sourceId: { startsWith: 'daily-action:' },
        active: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map(actionDto);
  });
}

export function createServiceDailyActionResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await json(request));
      if (!parsed.success)
        throw new ApplicationError('VALIDATION_ERROR', '入力内容を確認してください');
      const scope = await actionScope(serviceSlug, bunshinId);
      const sourceId = `daily-action:${parsed.data.type}:${parsed.data.idempotencyKey}`;
      const existing = await scope.db.prisma.bunshinMemory.findFirst({
        where: { workspaceId: scope.workspaceId, bunshinId, sourceType: 'USER_INPUT', sourceId },
      });
      if (existing) {
        const upload =
          parsed.data.type === 'PHOTO' &&
          existing.attachmentStatus === 'PENDING_UPLOAD' &&
          existing.attachmentStorageKey &&
          existing.attachmentMimeType
            ? await new DailyActionStorage().createUploadAuthorization({
                storageKey: existing.attachmentStorageKey,
                mimeType: existing.attachmentMimeType,
              })
            : null;
        return { action: actionDto(existing), upload };
      }
      const detail = typeDetails[parsed.data.type];
      const storageKey =
        parsed.data.type === 'PHOTO'
          ? `${scope.workspaceId}/${scope.actorUserId}/${bunshinId}/${randomUUID()}`
          : null;
      const action = await scope.db.prisma.bunshinMemory.create({
        data: {
          workspaceId: scope.workspaceId,
          bunshinId,
          type: detail.memoryType,
          content: parsed.data.text,
          summary: detail.label,
          sourceType: 'USER_INPUT',
          sourceId,
          confidence: 1,
          importance: parsed.data.type === 'REST_REASON' ? 3 : 4,
          ...(parsed.data.type === 'PHOTO'
            ? {
                attachmentStatus: 'PENDING_UPLOAD' as const,
                attachmentStorageKey: storageKey,
                attachmentMimeType: parsed.data.mimeType,
                attachmentSizeBytes: parsed.data.sizeBytes,
              }
            : {}),
        },
      });
      let upload = null;
      try {
        upload =
          parsed.data.type === 'PHOTO' && storageKey
            ? await new DailyActionStorage().createUploadAuthorization({
                storageKey,
                mimeType: parsed.data.mimeType,
              })
            : null;
      } catch (error) {
        await scope.db.prisma.bunshinMemory.updateMany({
          where: { id: action.id, workspaceId: scope.workspaceId, bunshinId },
          data: { attachmentStatus: 'REJECTED', active: false },
        });
        throw error;
      }
      return { action: actionDto(action), upload };
    },
    201,
  );
}

export function completeServiceDailyActionPhotoResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  actionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const scope = await actionScope(serviceSlug, bunshinId);
    const action = await scope.db.prisma.bunshinMemory.findFirst({
      where: {
        id: uuid.parse(actionId),
        workspaceId: scope.workspaceId,
        bunshinId,
        sourceType: 'USER_INPUT',
        sourceId: { startsWith: 'daily-action:PHOTO:' },
        attachmentStatus: 'PENDING_UPLOAD',
        deletedAt: null,
      },
    });
    if (!action?.attachmentStorageKey)
      throw new ApplicationError('NOT_FOUND', '保存待ちの写真が見つかりません');
    try {
      const verified = await new DailyActionStorage().verifyAndNormalize(
        action.attachmentStorageKey,
      );
      const updated = await scope.db.prisma.bunshinMemory.update({
        where: { id: action.id },
        data: {
          attachmentStatus: 'READY',
          attachmentMimeType: verified.mimeType,
          attachmentSizeBytes: verified.sizeBytes,
          attachmentWidth: verified.width,
          attachmentHeight: verified.height,
        },
      });
      return actionDto(updated);
    } catch (error) {
      await scope.db.prisma.bunshinMemory.updateMany({
        where: { id: action.id, workspaceId: scope.workspaceId, bunshinId },
        data: { attachmentStatus: 'REJECTED', active: false },
      });
      throw error;
    }
  });
}

export async function serviceDailyActionPhotoResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  actionId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const scope = await actionScope(serviceSlug, bunshinId);
    const action = await scope.db.prisma.bunshinMemory.findFirst({
      where: {
        id: uuid.parse(actionId),
        workspaceId: scope.workspaceId,
        bunshinId,
        sourceId: { startsWith: 'daily-action:PHOTO:' },
        attachmentStatus: 'READY',
        active: true,
        deletedAt: null,
      },
      select: { attachmentStorageKey: true },
    });
    if (!action?.attachmentStorageKey)
      throw new ApplicationError('NOT_FOUND', '写真が見つかりません');
    return Response.redirect(
      await new DailyActionStorage().createReadUrl(action.attachmentStorageKey),
      302,
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export function deleteServiceDailyActionResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  actionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const scope = await actionScope(serviceSlug, bunshinId);
    const action = await scope.db.prisma.bunshinMemory.findFirst({
      where: {
        id: uuid.parse(actionId),
        workspaceId: scope.workspaceId,
        bunshinId,
        sourceId: { startsWith: 'daily-action:' },
        deletedAt: null,
      },
      select: { id: true, attachmentStorageKey: true },
    });
    if (!action) throw new ApplicationError('NOT_FOUND', '記録が見つかりません');
    await scope.db.prisma.bunshinMemory.update({
      where: { id: action.id },
      data: { active: false, deletedAt: new Date() },
    });
    if (action.attachmentStorageKey)
      await new DailyActionStorage().remove(action.attachmentStorageKey);
    return { id: action.id };
  });
}
