import 'server-only';
import { createLogger } from '@bunshin/observability';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { currentLineEnvironment } from '../line/secure-configuration';
import { enableServiceBunshinNotifications } from '../line/enable-service-bunshin-notifications';
import { resolveMemberServiceContext } from '../services/public-service';

export async function optInServiceLineNotifications(request: Request, serviceSlug: string) {
  requireSameOrigin(request);
  const form = await request.formData();
  const values = form.getAll('lineNotifications');
  if (values.length !== 1 || values[0] !== 'all')
    return Response.json({ error: 'explicit notification consent required' }, { status: 400 });

  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) return Response.json({ error: 'authentication required' }, { status: 401 });
  const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
  const db = await import('@bunshin/database');
  const environment = currentLineEnvironment();
  const [routing, identity] = await Promise.all([
    db.prisma.groupLineRoutingPolicy.findUnique({
      where: {
        workspaceId_groupId_environment: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          environment,
        },
      },
      select: { mode: true },
    }),
    db.prisma.authIdentity.findFirst({
      where: { userId: actor.userId, provider: 'LINE' },
      select: { providerUserId: true },
    }),
  ]);
  if (routing?.mode === 'DEDICATED')
    return Response.redirect(
      new URL(`/s/${serviceSlug}/line?lineResult=DEDICATED_LINE_REQUIRED`, request.url),
      303,
    );
  if (!identity)
    return Response.redirect(
      new URL(`/s/${serviceSlug}/line?lineResult=FRIENDSHIP_NOT_CONFIRMED`, request.url),
      303,
    );
  const connection = identity
    ? await db.prisma.lineConnection.findFirst({
        where: {
          environment,
          workspaceId: service.workspaceId,
          userId: actor.userId,
          providerUserId: identity.providerUserId,
          status: 'ACTIVE',
          friendshipStatus: 'FOLLOWING',
        },
        select: { id: true },
      })
    : null;
  if (!connection)
    return Response.redirect(
      new URL(`/s/${serviceSlug}/line?lineResult=FRIENDSHIP_NOT_CONFIRMED`, request.url),
      303,
    );
  let result: string;
  try {
    result = await enableServiceBunshinNotifications({
      serviceSlug,
      actorUserId: actor.userId,
      verifiedProviderUserId: identity.providerUserId,
      friendshipConfirmed: true,
    });
  } catch (error) {
    result = 'ACTIVATION_FAILED';
    createLogger().error('service line notification opt-in failed', {
      serviceSlug,
      errorCode:
        error instanceof Error && /^[A-Z0-9_]{1,64}$/.test(error.message)
          ? error.message
          : 'ACTIVATION_FAILED',
    });
  }
  return Response.redirect(
    new URL(`/s/${serviceSlug}/line?lineResult=${result}`, request.url),
    303,
  );
}
