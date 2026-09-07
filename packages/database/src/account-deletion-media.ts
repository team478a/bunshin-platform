import { Prisma, type PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';

export interface AccountDeletionMediaStorage {
  remove(input: {
    bucket:
      | 'video-assets'
      | 'social-image-media'
      | 'video-renders'
      | 'video-ai-scenes'
      | 'video-narrations'
      | 'daily-action-materials';
    keys: string[];
  }): Promise<void>;
}

// Storage calls stay outside the database transaction. A failed deletion leaves
// the key and the processing lease intact, so the next batch can retry it.
export async function purgeAccountMedia(
  client: PrismaClient,
  input: { requestId: string; userId: string; workerId: string; now: Date },
  storage?: AccountDeletionMediaStorage,
): Promise<boolean | 'PENDING'> {
  const lease = {
    id: input.requestId,
    userId: input.userId,
    status: 'PROCESSING' as const,
    leaseOwner: input.workerId,
    leaseExpiresAt: { gt: input.now },
    user: { status: 'SUSPENDED' as const },
  };
  if (!(await client.accountDeletionRequest.findFirst({ where: lease, select: { id: true } })))
    return false;
  const owner = { ownerUserId: input.userId };
  const organization = { ...owner, workspace: { type: 'ORGANIZATION' as const } };
  if (
    (await client.ownerKnowledge.count({ where: organization })) > 0 ||
    (await client.bunshin.count({ where: organization })) > 0
  )
    return true; // The existing purge transaction records MANUAL_REVIEW_REQUIRED.

  // Suspension prevents new user requests. Give already running web/job
  // requests (maximum 300 seconds) and upload URLs time to expire first.
  const account = await client.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { updatedAt: true },
  });
  const hasMedia =
    (await client.videoProject.count({ where: owner })) +
    (await client.videoAsset.count({ where: owner })) +
    (await client.socialImageGenerationRequest.count({ where: owner })) +
    (await client.dailyAction.count({ where: { ...owner, assetStorageKey: { not: null } } }));
  if (hasMedia > 0 && input.now.getTime() - account.updatedAt.getTime() < 24 * 60 * 60 * 1000)
    return 'PENDING';
  await client.$transaction([
    client.videoProject.updateMany({ where: owner, data: { status: 'CANCELLED' } }),
    client.videoRender.updateMany({
      where: { ...owner, status: { in: ['QUEUED', 'SUBMITTED', 'RENDERING'] } },
      data: { status: 'CANCELLED' },
    }),
    client.videoSceneGeneration.updateMany({
      where: { ...owner, status: { in: ['QUEUED', 'SUBMITTED', 'GENERATING'] } },
      data: { status: 'CANCELLED' },
    }),
    client.socialImageGenerationRequest.updateMany({ where: owner, data: { status: 'CANCELLED' } }),
  ]);
  const take = 20;
  const [assets, images, renders, scenes, references, narrations, dailyActions] = await Promise.all(
    [
      client.videoAsset.findMany({ where: { ...owner, deletedAt: null }, take }),
      client.socialImageGeneratedMedia.findMany({ where: { ...owner, deletedAt: null }, take }),
      client.videoRender.findMany({ where: { ...owner, deletedAt: null }, take }),
      client.videoSceneGeneration.findMany({ where: { ...owner, deletedAt: null }, take }),
      client.socialImageGenerationRequest.findMany({
        where: { ...owner, referenceImage: { not: Prisma.DbNull }, referencePurgedAt: null },
        take,
      }),
      client.videoNarration.findMany({ where: { ...owner, deletedAt: null }, take }),
      client.dailyAction.findMany({ where: { ...owner, assetStorageKey: { not: null } }, take }),
    ],
  );
  const remove = async (
    bucket: Parameters<AccountDeletionMediaStorage['remove']>[0]['bucket'],
    keys: string[],
    workspaceId: string,
    groupId: string,
  ) => {
    if (!storage)
      throw new ApplicationError(
        'CONFIGURATION_ERROR',
        'Account deletion storage is not configured',
      );
    const prefix =
      bucket === 'video-assets'
        ? `video-assets/${workspaceId}/${input.userId}/`
        : bucket === 'daily-action-materials'
          ? `${workspaceId}/${input.userId}/${groupId}/`
          : bucket === 'social-image-media'
            ? `${workspaceId}/${groupId}/${input.userId}/`
            : `${workspaceId}/${input.userId}/`;
    if (keys.some((key) => !key.startsWith(prefix) || key.includes('..')))
      throw new ApplicationError('CONFLICT', 'Account deletion storage scope mismatch');
    if (
      !(await client.accountDeletionRequest.findFirst({
        where: { ...lease, leaseExpiresAt: { gt: new Date() } },
        select: { id: true },
      }))
    )
      throw new ApplicationError('CONFLICT', 'Account deletion lease expired');
    await storage.remove({ bucket, keys });
  };
  for (const asset of assets) {
    await remove('video-assets', [asset.storageKey], asset.workspaceId, asset.groupId);
    await client.videoAsset.updateMany({
      where: { id: asset.id, ...owner },
      data: {
        status: 'DELETED',
        deletedAt: input.now,
        originalFilename: 'deleted',
        usageTerms: null,
      },
    });
  }
  for (const image of images) {
    await remove(
      'social-image-media',
      [image.sourceStorageKey, image.completedStorageKey, image.thumbnailStorageKey].filter(
        (key): key is string => Boolean(key),
      ),
      image.workspaceId,
      image.groupId,
    );
    await client.socialImageGeneratedMedia.updateMany({
      where: { id: image.id, ...owner },
      data: { status: 'DELETED', deletedAt: input.now },
    });
  }
  for (const render of renders) {
    await remove(
      'video-renders',
      [render.outputStorageKey ?? `${render.workspaceId}/${input.userId}/${render.id}.mp4`],
      render.workspaceId,
      render.groupId,
    );
    await client.videoRender.updateMany({
      where: { id: render.id, ...owner },
      data: { outputStorageKey: null, deletedAt: input.now, notificationSnapshot: null },
    });
  }
  for (const scene of scenes) {
    await remove(
      'video-ai-scenes',
      [scene.outputStorageKey ?? `${scene.workspaceId}/${input.userId}/${scene.id}.mp4`],
      scene.workspaceId,
      scene.groupId,
    );
    await client.videoSceneGeneration.updateMany({
      where: { id: scene.id, ...owner },
      data: { outputStorageKey: null, deletedAt: input.now, inputSnapshot: {} },
    });
  }
  for (const reference of references) {
    const key = `${reference.workspaceId}/${reference.groupId}/${input.userId}/${reference.id}/${reference.id}/reference.png`;
    await remove('social-image-media', [key], reference.workspaceId, reference.groupId);
    await client.socialImageGenerationRequest.updateMany({
      where: { id: reference.id, ...owner },
      data: { referencePurgedAt: input.now, referenceImage: Prisma.DbNull },
    });
  }
  for (const narration of narrations) {
    await remove(
      'video-narrations',
      [
        narration.storageKey ??
          `${narration.workspaceId}/${input.userId}/${narration.renderId}.wav`,
      ],
      narration.workspaceId,
      narration.groupId,
    );
    await client.videoNarration.updateMany({
      where: { id: narration.id, ...owner },
      data: { status: 'DELETED', deletedAt: input.now, storageKey: null },
    });
  }
  for (const action of dailyActions) {
    await remove(
      'daily-action-materials',
      [action.assetStorageKey!],
      action.workspaceId,
      action.bunshinId,
    );
    await client.dailyAction.updateMany({
      where: { id: action.id, ...owner },
      data: {
        title: '退会済みデータ',
        content: '',
        assetStorageKey: null,
        assetMimeType: null,
        assetOriginalFilename: null,
        assetSizeBytes: null,
        assetPurgedAt: input.now,
      },
    });
  }
  // Full pages may have more data. Reclaim on the next batch rather than mark
  // the account completed before every page has been purged.
  return [assets, images, renders, scenes, references, narrations, dailyActions].every(
    (page) => page.length < take,
  )
    ? true
    : 'PENDING';
}
