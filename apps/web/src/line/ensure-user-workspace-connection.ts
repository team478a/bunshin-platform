import 'server-only';
import { ConnectLineMessagingAccount } from '@bunshin/application';
import { currentLineEnvironment } from './secure-configuration';

export async function ensureUserWorkspaceLineConnection(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const db = await import('@bunshin/database');
  const environment = currentLineEnvironment();
  const [identity, source] = await Promise.all([
    db.prisma.authIdentity.findFirst({
      where: { userId, provider: 'LINE' },
      select: { providerUserId: true },
    }),
    db.prisma.lineConnection.findFirst({
      where: { userId, environment, status: 'ACTIVE', workspaceId: { not: workspaceId } },
      orderBy: [{ notificationConsentAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      select: {
        friendshipStatus: true,
        notificationConsentAt: true,
        followedAt: true,
        unfollowedAt: true,
        lastWebhookAt: true,
      },
    }),
  ]);
  if (!identity) return false;

  await new ConnectLineMessagingAccount(new db.PrismaLineConnectionRepository()).execute({
    environment,
    workspaceId,
    actorUserId: userId,
    verifiedProviderUserId: identity.providerUserId,
    consentGranted: source?.notificationConsentAt !== null && source !== null,
  });
  if (source)
    await db.prisma.lineConnection.update({
      where: { environment_workspaceId_userId: { environment, workspaceId, userId } },
      data: {
        friendshipStatus: source.friendshipStatus,
        notificationConsentAt: source.notificationConsentAt,
        followedAt: source.followedAt,
        unfollowedAt: source.unfollowedAt,
        lastWebhookAt: source.lastWebhookAt,
      },
    });
  return true;
}
