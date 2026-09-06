import 'server-only';
import { ConnectLineMessagingAccount } from '@bunshin/application';
import { currentLineEnvironment } from './secure-configuration';

export async function ensureUserWorkspaceLineConnection(
  userId: string,
  workspaceId: string,
  consentGranted?: boolean,
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

  const existing = await db.prisma.lineConnection.findUnique({
    where: { environment_workspaceId_userId: { environment, workspaceId, userId } },
    select: { id: true },
  });

  await new ConnectLineMessagingAccount(new db.PrismaLineConnectionRepository()).execute({
    environment,
    workspaceId,
    actorUserId: userId,
    verifiedProviderUserId: identity.providerUserId,
    consentGranted: consentGranted ?? (source?.notificationConsentAt !== null && source !== null),
  });
  if (source && !existing)
    await db.prisma.lineConnection.update({
      where: { environment_workspaceId_userId: { environment, workspaceId, userId } },
      data: {
        friendshipStatus: source.friendshipStatus,
        notificationConsentAt: consentGranted ? new Date() : source.notificationConsentAt,
        followedAt: source.followedAt,
        unfollowedAt: source.unfollowedAt,
        lastWebhookAt: source.lastWebhookAt,
      },
    });
  return true;
}
