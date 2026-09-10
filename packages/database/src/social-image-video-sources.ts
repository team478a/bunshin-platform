import type { Prisma } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';

export async function authorizedSocialImageVideoSources(
  client: Pick<Prisma.TransactionClient, 'socialImageGenerationRequest'>,
  scope: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    ownerUserId: string;
    requestId: string;
  },
  now = new Date(),
) {
  const request = await client.socialImageGenerationRequest.findFirst({
    where: {
      id: scope.requestId,
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      groupMembershipId: scope.groupMembershipId,
      ownerUserId: scope.ownerUserId,
      status: 'READY_FOR_REVIEW',
    },
    select: {
      id: true,
      media: {
        where: {
          status: { in: ['READY', 'ADOPTED'] },
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { pageIndex: 'asc' },
        select: { id: true, pageIndex: true, status: true, completedStorageKey: true },
      },
    },
  });
  if (
    !request ||
    request.media.length !== 5 ||
    request.media.some((media, index) => media.pageIndex !== index) ||
    !request.media.some((media) => media.status === 'ADOPTED')
  )
    throw new ApplicationError(
      'VALIDATION_ERROR',
      '採用した5枚の投稿画像を確認できません。画像を選び直してください。',
    );
  const prefix = `${scope.workspaceId}/${scope.groupId}/${scope.ownerUserId}/${scope.requestId}/`;
  if (
    request.media.some(
      (media) =>
        !media.completedStorageKey.startsWith(prefix) ||
        media.completedStorageKey.includes('..') ||
        !media.completedStorageKey.endsWith('/completed.png'),
    )
  )
    throw new ApplicationError('FORBIDDEN', 'social image storage scope mismatch');
  return request.media;
}
