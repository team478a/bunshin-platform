import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import { currentLineEnvironment } from '../line/secure-configuration';
import { resolveMemberServiceContext } from './public-service';

export async function loadServiceLineSettings(serviceSlug: string, actorUserId: string) {
  const service = await resolveMemberServiceContext(serviceSlug, actorUserId);
  const db = await import('@bunshin/database');
  const environment = currentLineEnvironment();
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actorUserId,
      status: 'ACTIVE',
      user: { status: 'ACTIVE' },
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { id: true, consentedAt: true },
  });
  if (!membership) throw new ApplicationError('NOT_FOUND', 'membership not found');
  const legalConsent = membership.consentedAt
    ? await new db.PrismaServiceParticipationRepository().findLegalConsentView({
        slug: serviceSlug,
        actorUserId,
        now: new Date(),
      })
    : null;
  const consented =
    legalConsent?.legalDocuments.every(({ id }) => legalConsent.acceptedDocumentIds.includes(id)) ??
    false;
  const scope = { workspaceId: service.workspaceId, groupId: service.serviceId };
  const [policy, partners] = await Promise.all([
    db.prisma.groupLineRoutingPolicy.findUnique({
      where: { workspaceId_groupId_environment: { ...scope, environment } },
      select: { mode: true, pilotEnabled: true },
    }),
    db.prisma.bunshin.findMany({
      where: { ...scope, ownerUserId: actorUserId, status: { not: 'ARCHIVED' } },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const mode = policy?.mode ?? 'SHARED';
  const configuration =
    mode === 'DEDICATED'
      ? await db.prisma.groupLineChannelConfiguration.findFirst({
          where: { ...scope, environment, status: 'ACTIVE' },
          select: {
            id: true,
            lastVerifiedAt: true,
            lastErrorCategory: true,
            globallyPaused: true,
          },
        })
      : null;
  const connection = configuration
    ? await db.prisma.groupLineConnection.findFirst({
        where: {
          ...scope,
          configurationId: configuration.id,
          groupMembershipId: membership.id,
          userId: actorUserId,
        },
        select: { status: true, friendshipStatus: true, notificationConsentAt: true },
      })
    : null;
  const available = Boolean(
    mode === 'DEDICATED' &&
    policy?.pilotEnabled &&
    configuration?.lastVerifiedAt &&
    !configuration.lastErrorCategory &&
    !configuration.globallyPaused,
  );
  const connected = Boolean(
    connection?.status === 'ACTIVE' &&
    connection.friendshipStatus === 'FOLLOWING' &&
    connection.notificationConsentAt,
  );
  return {
    service,
    mode,
    partners,
    available,
    connected,
    consented,
  };
}
