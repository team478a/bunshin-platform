import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requireSameOrigin } from '../auth/request-security';
import { SupabaseGroupKnowledgeStorage } from '../knowledge/group-knowledge-storage';
import {
  actor,
  completeSchema,
  dependencies,
  enqueueExtraction,
  publicSource,
  uuid,
} from './group-knowledge-http-core';

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
