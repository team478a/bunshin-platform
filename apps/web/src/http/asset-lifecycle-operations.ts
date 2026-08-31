import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { SupabaseAssetLifecycleStorage } from '../assets/asset-lifecycle-storage';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();
const batchSize = 50;

export interface AssetLifecycleSummary {
  scanned: number;
  deleted: number;
  failed: number;
}

export async function runExpiredAssetPurge(now = new Date()): Promise<AssetLifecycleSummary> {
  const db = await import('@bunshin/database');
  const storage = new SupabaseAssetLifecycleStorage();
  const due = { lte: now };
  const [videoAssets, images, renders, scenes] = await Promise.all([
    db.prisma.videoAsset.findMany({
      where: { status: { in: ['PENDING_UPLOAD', 'READY', 'REJECTED'] }, expiresAt: due },
      orderBy: { expiresAt: 'asc' },
      take: batchSize,
      select: { id: true, storageKey: true },
    }),
    db.prisma.socialImageGeneratedMedia.findMany({
      where: { status: { in: ['READY', 'ADOPTED', 'REJECTED'] }, expiresAt: due },
      orderBy: { expiresAt: 'asc' },
      take: batchSize,
      select: {
        id: true,
        sourceStorageKey: true,
        completedStorageKey: true,
        thumbnailStorageKey: true,
      },
    }),
    db.prisma.videoRender.findMany({
      where: { status: 'SUCCEEDED', expiresAt: due, outputStorageKey: { not: null } },
      orderBy: { expiresAt: 'asc' },
      take: batchSize,
      select: { id: true, outputStorageKey: true },
    }),
    db.prisma.videoSceneGeneration.findMany({
      where: { status: 'SUCCEEDED', expiresAt: due, outputStorageKey: { not: null } },
      orderBy: { expiresAt: 'asc' },
      take: batchSize,
      select: { id: true, outputStorageKey: true },
    }),
  ]);

  let deleted = 0;
  let failed = 0;
  const remove = async (operation: () => Promise<void>) => {
    try {
      await operation();
      deleted += 1;
    } catch {
      failed += 1;
    }
  };

  await Promise.all([
    ...videoAssets.map((asset) =>
      remove(async () => {
        await storage.remove({ bucket: 'video-assets', keys: [asset.storageKey] });
        await db.prisma.videoAsset.updateMany({
          where: {
            id: asset.id,
            status: { in: ['PENDING_UPLOAD', 'READY', 'REJECTED'] },
            expiresAt: due,
          },
          data: { status: 'DELETED', deletedAt: now },
        });
      }),
    ),
    ...images.map((image) =>
      remove(async () => {
        await storage.remove({
          bucket: 'social-image-media',
          keys: [
            image.sourceStorageKey,
            image.completedStorageKey,
            image.thumbnailStorageKey,
          ].filter((key): key is string => Boolean(key)),
        });
        await db.prisma.socialImageGeneratedMedia.updateMany({
          where: { id: image.id, status: { in: ['READY', 'ADOPTED', 'REJECTED'] }, expiresAt: due },
          data: { status: 'DELETED', deletedAt: now },
        });
      }),
    ),
    ...renders.map((render) =>
      remove(async () => {
        await storage.remove({ bucket: 'video-renders', keys: [render.outputStorageKey!] });
        await db.prisma.videoRender.updateMany({
          where: { id: render.id, status: 'SUCCEEDED', expiresAt: due },
          data: { outputStorageKey: null, deletedAt: now },
        });
      }),
    ),
    ...scenes.map((scene) =>
      remove(async () => {
        await storage.remove({ bucket: 'video-ai-scenes', keys: [scene.outputStorageKey!] });
        await db.prisma.videoSceneGeneration.updateMany({
          where: { id: scene.id, status: 'SUCCEEDED', expiresAt: due },
          data: { outputStorageKey: null, deletedAt: now },
        });
      }),
    ),
  ]);
  return {
    scanned: videoAssets.length + images.length + renders.length + scenes.length,
    deleted,
    failed,
  };
}

export async function assetLifecycleOperationsResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const environment = getServerEnvironment();
    authorizeCronRequest(request, environment.CRON_SECRET);
    if (environment.APP_ENV !== 'production') return Response.json({ mode: 'disabled', requestId });
    const result = await runExpiredAssetPurge();
    logger.info('asset lifecycle batch complete', {
      requestId,
      route: '/api/internal/assets/purge-expired',
      status: 200,
      latency: Date.now() - started,
      ...result,
    });
    return Response.json({ ...result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('asset lifecycle batch failed', {
      requestId,
      route: '/api/internal/assets/purge-expired',
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
