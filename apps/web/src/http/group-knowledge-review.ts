import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requireSameOrigin } from '../auth/request-security';
import {
  actor,
  dependencies,
  publicSource,
  updateReviewSchema,
  uuid,
} from './group-knowledge-http-core';

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
    const previousSource =
      source.version > 1
        ? await db.prisma.groupKnowledgeSource.findFirst({
            where: {
              workspaceId: scope.workspaceId,
              groupId: scope.groupId,
              logicalKey: source.logicalKey,
              version: { lt: source.version },
              chunks: { some: {} },
            },
            orderBy: { version: 'desc' },
            select: {
              version: true,
              chunks: {
                orderBy: { sortOrder: 'asc' },
                select: { id: true, content: true },
              },
            },
          })
        : null;
    return Response.json(
      {
        data: {
          source: publicSource(source),
          chunks,
          previousVersion: previousSource
            ? { version: previousSource.version, chunks: previousSource.chunks }
            : null,
        },
        requestId,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function updateGroupKnowledgeReviewResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  sourceId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const current = await actor();
    const input = updateReviewSchema.parse(await request.json());
    const { service } = await dependencies();
    const scope = {
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: current.userId,
      sourceId: uuid.parse(sourceId),
    };
    await service.updateReviewChunkContents({ ...scope, chunks: input.chunks });
    return Response.json(
      { data: { chunks: input.chunks }, requestId },
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
