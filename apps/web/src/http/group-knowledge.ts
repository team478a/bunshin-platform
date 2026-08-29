import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  EnqueueJob,
  GROUP_KNOWLEDGE_EXTRACTION_JOB_TYPE,
  GroupKnowledgeService,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';

import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { SupabaseGroupKnowledgeStorage } from '../knowledge/group-knowledge-storage';

const uuid = z.string().uuid();
const common = {
  title: z.string().trim().min(1).max(200),
  productPackVersionId: z.uuid().nullable().optional(),
};
const createSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('URL'), ...common, sourceUri: z.url().max(2048) }).strict(),
  z
    .object({ type: z.literal('TEXT'), ...common, content: z.string().trim().min(1).max(8000) })
    .strict(),
  z
    .object({
      type: z.enum(['PDF', 'VIDEO']),
      ...common,
      originalFileName: z.string().trim().min(1).max(255),
      mimeType: z.enum(['application/pdf', 'video/mp4', 'video/quicktime']),
      sizeBytes: z.number().int().positive().max(200_000_000),
      rightsConfirmed: z.literal(true),
    })
    .strict(),
]);

const completeSchema = z
  .object({ sizeBytes: z.number().int().positive().max(200_000_000) })
  .strict();

function publicSource(source: {
  id: string;
  type: string;
  title: string;
  sourceUri: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  productPackVersionId: string | null;
  status: string;
  version: number;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: source.id,
    type: source.type,
    title: source.title,
    sourceUri: source.sourceUri,
    originalFileName: source.originalFileName,
    mimeType: source.mimeType,
    productPackVersionId: source.productPackVersionId,
    status: source.status,
    version: source.version,
    failureCode: source.failureCode,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

async function dependencies() {
  const db = await import('@bunshin/database');
  const repository = new db.PrismaGroupKnowledgeRepository();
  return { repository, service: new GroupKnowledgeService(repository) };
}

async function actor() {
  const value = await (await currentUserProvider()).getCurrentUser();
  if (!value) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return value;
}

async function enqueueExtraction(input: {
  workspaceId: string;
  groupId: string;
  sourceId: string;
  actorUserId: string;
  correlationId: string;
  idempotencySuffix?: string;
}) {
  const db = await import('@bunshin/database');
  const environment = getServerEnvironment().APP_ENV.toUpperCase() as
    'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
    workspaceId: input.workspaceId,
    correlationId: input.correlationId,
    requestedBy: input.actorUserId,
    environment,
    jobType: GROUP_KNOWLEDGE_EXTRACTION_JOB_TYPE,
    idempotencyKey: `group-knowledge:${input.sourceId}:${input.idempotencySuffix ?? 'v1'}`,
    payloadReference: `group-knowledge:${input.groupId}:${input.sourceId}:${input.actorUserId}`,
    maxAttempts: 3,
  });
}

export async function listGroupKnowledgeResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const current = await actor();
    const { service } = await dependencies();
    const sources = await service.listForManagement({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: current.userId,
    });
    return Response.json(
      { data: sources.map(publicSource), requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function createGroupKnowledgeResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const current = await actor();
    const parsedWorkspaceId = uuid.parse(workspaceId);
    const parsedGroupId = uuid.parse(groupId);
    const input = createSchema.parse(await request.json());
    const { service } = await dependencies();
    const scope = {
      workspaceId: parsedWorkspaceId,
      groupId: parsedGroupId,
      actorUserId: current.userId,
    };
    if (input.type === 'URL') {
      const source = await service.createSource({
        ...scope,
        type: 'URL',
        title: input.title,
        sourceUri: input.sourceUri,
        productPackVersionId: input.productPackVersionId ?? null,
      });
      await enqueueExtraction({ ...scope, sourceId: source.id, correlationId: requestId });
      return Response.json(
        { data: { source: publicSource(source) }, requestId },
        { status: 201, headers: { 'cache-control': 'private, no-store' } },
      );
    }
    if (input.type === 'TEXT') {
      const source = await service.createSource({
        ...scope,
        type: 'TEXT',
        title: input.title,
        productPackVersionId: input.productPackVersionId ?? null,
      });
      await service.beginProcessing({ ...scope, sourceId: source.id });
      await service.saveExtraction({
        ...scope,
        sourceId: source.id,
        chunks: [
          { type: 'GENERAL', content: input.content, sourceLabel: input.title, confidence: 1 },
        ],
      });
      const refreshed = (await service.listForManagement(scope)).find(
        (item) => item.id === source.id,
      );
      return Response.json(
        { data: { source: publicSource(refreshed ?? source) }, requestId },
        { status: 201, headers: { 'cache-control': 'private, no-store' } },
      );
    }

    const allowedMime =
      input.type === 'PDF'
        ? input.mimeType === 'application/pdf'
        : ['video/mp4', 'video/quicktime'].includes(input.mimeType);
    if (!allowedMime)
      throw new ApplicationError('VALIDATION_ERROR', '選択した種類とファイルが一致しません');
    const storageKey = `${parsedWorkspaceId}/${parsedGroupId}/${current.userId}/${randomUUID()}`;
    const source = await service.createSource({
      ...scope,
      type: input.type,
      title: input.title,
      storageKey,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      productPackVersionId: input.productPackVersionId ?? null,
    });
    const upload = await new SupabaseGroupKnowledgeStorage().createUploadAuthorization({
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });
    return Response.json(
      { data: { source: publicSource(source), upload }, requestId },
      { status: 201, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function completeGroupKnowledgeUploadResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  sourceId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const current = await actor();
    const input = completeSchema.parse(await request.json());
    const scope = {
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: current.userId,
    };
    const { service } = await dependencies();
    const source = (await service.listForManagement(scope)).find(
      (item) => item.id === uuid.parse(sourceId),
    );
    if (!source?.storageKey || !source.mimeType || !['PDF', 'VIDEO'].includes(source.type))
      throw new ApplicationError('NOT_FOUND', 'アップロード対象が見つかりません');
    await new SupabaseGroupKnowledgeStorage().inspectUploadedObject({
      storageKey: source.storageKey,
      expectedMimeType: source.mimeType,
      expectedSizeBytes: input.sizeBytes,
    });
    await enqueueExtraction({ ...scope, sourceId: source.id, correlationId: requestId });
    return Response.json(
      { data: { source: publicSource(source), uploadVerified: true }, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function getGroupKnowledgeReviewResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  sourceId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const current = await actor();
    const scope = {
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: current.userId,
    };
    const parsedSourceId = uuid.parse(sourceId);
    const { service } = await dependencies();
    const source = (await service.listForManagement(scope)).find(
      (item) => item.id === parsedSourceId,
    );
    if (!source) throw new ApplicationError('NOT_FOUND', '資料が見つかりません');
    const db = await import('@bunshin/database');
    const chunks = await db.prisma.groupKnowledgeChunk.findMany({
      where: {
        sourceId: parsedSourceId,
        source: { workspaceId: scope.workspaceId, groupId: scope.groupId },
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        type: true,
        content: true,
        sourceLabel: true,
        pageNumber: true,
        startSeconds: true,
        endSeconds: true,
        confidence: true,
      },
    });
    return Response.json(
      { data: { source: publicSource(source), chunks }, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function changeGroupKnowledgeStateResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  sourceId: string,
  action: 'approve' | 'archive' | 'retry',
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const current = await actor();
    const scope = {
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: current.userId,
      sourceId: uuid.parse(sourceId),
    };
    const { service } = await dependencies();
    if (action === 'approve') await service.approve(scope);
    else if (action === 'archive') await service.archive(scope);
    else {
      const failed = (await service.listForManagement(scope)).find(
        (item) => item.id === scope.sourceId && item.status === 'FAILED',
      );
      if (!failed) throw new ApplicationError('CONFLICT', '再読み取りできる状態ではありません');
      await enqueueExtraction({
        ...scope,
        correlationId: requestId,
        idempotencySuffix: `retry-${failed.updatedAt.getTime()}`,
      });
    }
    const source = (await service.listForManagement(scope)).find(
      (item) => item.id === scope.sourceId,
    );
    if (!source) throw new ApplicationError('NOT_FOUND', '資料が見つかりません');
    return Response.json(
      { data: { source: publicSource(source) }, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}
