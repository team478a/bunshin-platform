import type { Prisma } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';

export async function authorizedVideoPhotos(
  client: Pick<Prisma.TransactionClient, 'videoAsset'>,
  scope: { workspaceId: string; groupId: string; groupMembershipId: string; ownerUserId: string },
  ids: string[],
  now = new Date(),
) {
  if (ids.length === 0) return [];
  if (ids.length > 5 || new Set(ids).size !== ids.length)
    throw new ApplicationError('VALIDATION_ERROR', '写真は重複なしで5枚まで選択してください。');
  const photos = await client.videoAsset.findMany({
    where: {
      ...scope,
      id: { in: ids },
      status: 'READY',
      deletedAt: null,
      kind: { in: ['IMAGE', 'LOGO'] },
      verifiedMimeType: { in: ['image/jpeg', 'image/png', 'image/webp'] },
      rightsConfirmedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, storageKey: true },
  });
  if (photos.length !== ids.length)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      '選択した写真の利用許可・保存期限を確認できません。写真を選び直してください。',
    );
  const prefix = `video-assets/${scope.workspaceId}/${scope.ownerUserId}/`;
  if (
    photos.some((photo) => !photo.storageKey.startsWith(prefix) || photo.storageKey.includes('..'))
  )
    throw new ApplicationError('FORBIDDEN', 'photo storage scope mismatch');
  return ids.map((id) => photos.find((photo) => photo.id === id)!);
}
