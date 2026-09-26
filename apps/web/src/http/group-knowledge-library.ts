import 'server-only';
import { randomUUID } from 'node:crypto';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requireSameOrigin } from '../auth/request-security';
import { SupabaseGroupKnowledgeStorage } from '../knowledge/group-knowledge-storage';
import {
  actor,
  createSchema,
  dependencies,
  enqueueExtraction,
  publicSource,
  uuid,
} from './group-knowledge-http-core';

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
