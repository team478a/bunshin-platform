import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requireSameOrigin } from '../auth/request-security';
import {
  actor,
  dependencies,
  enqueueExtraction,
  publicSource,
  updateScopeSchema,
  uuid,
} from './group-knowledge-http-core';

export async function updateGroupKnowledgeScopeResponse(
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
    const input = updateScopeSchema.parse(await request.json());
    const { service } = await dependencies();
    const source = await service.updateProductScope({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: current.userId,
      sourceId: uuid.parse(sourceId),
      productPackVersionId: input.productPackVersionId,
    });
    return Response.json(
      { data: { source: publicSource(source) }, requestId },
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
      const recoverable = (await service.listForManagement(scope)).find(
        (item) => item.id === scope.sourceId && ['FAILED', 'REVIEW_REQUIRED'].includes(item.status),
      );
      if (!recoverable)
        throw new ApplicationError('CONFLICT', '再読み取りできる状態ではありません');
      await enqueueExtraction({
        ...scope,
        correlationId: requestId,
        idempotencySuffix: `retry-${recoverable.updatedAt.getTime()}`,
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
