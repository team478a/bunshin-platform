import 'server-only';
import { ConnectLineMessagingAccount } from '@bunshin/application';
import { currentLineEnvironment } from './secure-configuration';

export async function ensureUserWorkspaceLineConnection(
  userId: string,
  workspaceId: string,
  consentGranted = false,
): Promise<boolean> {
  const db = await import('@bunshin/database');
  const environment = currentLineEnvironment();
  const identity = await db.prisma.authIdentity.findFirst({
    where: { userId, provider: 'LINE' },
    select: { providerUserId: true },
  });
  if (!identity) return false;

  await new ConnectLineMessagingAccount(new db.PrismaLineConnectionRepository()).execute({
    environment,
    workspaceId,
    actorUserId: userId,
    verifiedProviderUserId: identity.providerUserId,
    consentGranted,
  });
  return true;
}
