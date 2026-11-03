import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import type { SocialAccountConnectionOwner } from '@bunshin/database';
import { socialAccountTokenCrypto } from '../providers/social-account-token';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function socialAccountConnectionOwner(
  slug: string,
  bunshinId: string,
  actorUserId: string,
) {
  if (!slugPattern.test(slug) || slug.length > 80 || !uuidPattern.test(bunshinId))
    throw new ApplicationError('NOT_FOUND', 'SNS connection owner unavailable');
  const db = await import('@bunshin/database');
  const configuration = await db.prisma.serviceConfiguration.findUnique({
    where: { slug },
    select: { workspaceId: true, groupId: true, displayName: true },
  });
  if (!configuration) throw new ApplicationError('NOT_FOUND', 'SNS connection owner unavailable');
  const [membership, bunshin] = await Promise.all([
    db.prisma.groupMembership.findFirst({
      where: {
        workspaceId: configuration.workspaceId,
        groupId: configuration.groupId,
        userId: actorUserId,
      },
      select: { id: true },
    }),
    db.prisma.bunshin.findFirst({
      where: {
        id: bunshinId,
        workspaceId: configuration.workspaceId,
        groupId: configuration.groupId,
        ownerUserId: actorUserId,
      },
      select: { id: true, name: true },
    }),
  ]);
  if (!membership || !bunshin)
    throw new ApplicationError('NOT_FOUND', 'SNS connection owner unavailable');
  const owner: SocialAccountConnectionOwner = {
    workspaceId: configuration.workspaceId,
    serviceId: configuration.groupId,
    groupMembershipId: membership.id,
    userId: actorUserId,
    bunshinId: bunshin.id,
  };
  return { owner, targetName: bunshin.name, serviceName: configuration.displayName };
}

export async function socialAccountConnections() {
  const db = await import('@bunshin/database');
  return new db.PrismaSocialAccountConnections(db.prisma, socialAccountTokenCrypto);
}
