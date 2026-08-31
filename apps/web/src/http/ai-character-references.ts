import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';
import { AiCharacterReferenceStorage } from '../ai-character-reference-storage';
const uuid = z.string().uuid();
async function actor() {
  const value = await (await currentUserProvider()).getCurrentUser();
  if (!value) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return value;
}
function fail(error: unknown, requestId: string) {
  const mapped = toApiError(error, requestId);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
}
export async function uploadAiCharacterReferenceResponse(
  request: Request,
  serviceSlug: string,
  rawVersionId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const user = await actor();
    const [service, versionId] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, user.userId),
      uuid.parseAsync(rawVersionId),
    ]);
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File) || form.get('rightsConfirmed') !== 'true')
      throw new ApplicationError('VALIDATION_ERROR', '画像と利用許可の確認が必要です');
    const db = await import('@bunshin/database');
    const version = await db.prisma.aiCharacterProfileVersion.findFirst({
      where: {
        id: versionId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'PUBLISHED',
      },
    });
    if (!version) throw new ApplicationError('NOT_FOUND', '公開中の生成設定が見つかりません');
    const storage = new AiCharacterReferenceStorage();
    const stored = await storage.upload({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      versionId,
      file,
    });
    try {
      const asset = await db.prisma.$transaction(async (tx) => {
        const created = await tx.aiCharacterReferenceAsset.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            characterProfileVersionId: version.id,
            storageKey: stored.storageKey,
            originalFilename: stored.originalFilename,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            sha256: stored.sha256,
            status: 'READY',
            rightsConfirmedAt: new Date(),
            createdByUserId: user.userId,
          },
        });
        await tx.aiCharacterAuditLog.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            characterProfileId: version.characterProfileId,
            resourceType: 'REFERENCE_ASSET',
            resourceId: created.id,
            action: 'UPLOADED',
            afterData: {
              id: created.id,
              characterProfileVersionId: version.id,
              mimeType: created.mimeType,
              sizeBytes: created.sizeBytes,
              sha256: created.sha256,
            },
            performedByUserId: user.userId,
          },
        });
        return created;
      });
      return Response.json(
        { data: asset, requestId },
        { status: 201, headers: { 'cache-control': 'private, no-store' } },
      );
    } catch (error) {
      await storage.remove(stored.storageKey);
      throw error;
    }
  } catch (error) {
    return fail(error, requestId);
  }
}
export async function aiCharacterReferenceImageResponse(
  request: Request,
  serviceSlug: string,
  rawAssetId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const user = await actor();
    const [service, assetId] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, user.userId),
      uuid.parseAsync(rawAssetId),
    ]);
    const db = await import('@bunshin/database');
    const asset = await db.prisma.aiCharacterReferenceAsset.findFirst({
      where: {
        id: assetId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'READY',
      },
    });
    if (!asset) throw new ApplicationError('NOT_FOUND', '画像が見つかりません');
    const image = await new AiCharacterReferenceStorage().download(asset.storageKey);
    return new Response(image, {
      headers: {
        'cache-control': 'private, no-store',
        'content-type': asset.mimeType,
        'content-disposition': 'inline',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return fail(error, requestId);
  }
}
