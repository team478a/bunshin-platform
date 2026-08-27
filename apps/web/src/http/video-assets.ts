import 'server-only';
import {
  CompleteVideoAssetUpload,
  ListReadyVideoAssets,
  PrepareVideoAssetUpload,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { SupabaseVideoAssetStorage } from '../video/video-asset-storage';

const uuid = z.string().uuid();
const prepareSchema = z
  .object({
    groupMembershipId: z.uuid(),
    videoProjectId: z.uuid().nullable().optional(),
    kind: z.enum(['IMAGE', 'VIDEO', 'LOGO']),
    originalFilename: z.string().trim().min(1).max(255),
    declaredMimeType: z.string().trim().min(1).max(100),
    declaredSizeBytes: z.number().int().positive().max(200_000_000),
    rightsConfirmed: z.literal(true),
    usageTerms: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

function publicAsset(asset: Awaited<ReturnType<ListReadyVideoAssets['execute']>>[number]) {
  return {
    id: asset.id,
    videoProjectId: asset.videoProjectId,
    kind: asset.kind,
    status: asset.status,
    originalFilename: asset.originalFilename,
    mimeType: asset.verifiedMimeType,
    sizeBytes: asset.verifiedSizeBytes,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    expiresAt: asset.expiresAt,
    createdAt: asset.createdAt,
  };
}

async function dependencies() {
  const db = await import('@bunshin/database');
  const repository = new db.PrismaVideoAssetRepository();
  const storage = new SupabaseVideoAssetStorage();
  return { repository, storage };
}

export async function prepareVideoAssetResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const input = prepareSchema.parse(await request.json());
    const { repository, storage } = await dependencies();
    const prepared = await new PrepareVideoAssetUpload(repository, storage).execute({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      groupMembershipId: input.groupMembershipId,
      actorUserId: actor.userId,
      videoProjectId: input.videoProjectId ?? null,
      kind: input.kind,
      originalFilename: input.originalFilename,
      declaredMimeType: input.declaredMimeType,
      declaredSizeBytes: input.declaredSizeBytes,
      rightsConfirmed: input.rightsConfirmed,
      usageTerms: input.usageTerms ?? null,
    });
    return Response.json(
      {
        data: {
          asset: publicAsset(prepared.asset),
          upload: prepared.authorization,
        },
        requestId,
      },
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

export async function listVideoAssetsResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const project = new URL(request.url).searchParams.get('videoProjectId');
    const { repository } = await dependencies();
    const assets = await new ListReadyVideoAssets(repository).execute({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: actor.userId,
      videoProjectId: project ? uuid.parse(project) : null,
    });
    return Response.json(
      { data: assets.map(publicAsset), requestId },
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

export async function completeVideoAssetResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  assetId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const { repository, storage } = await dependencies();
    const asset = await new CompleteVideoAssetUpload(repository, storage).execute({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: actor.userId,
      assetId: uuid.parse(assetId),
    });
    return Response.json(
      { data: publicAsset(asset), requestId },
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
