import 'server-only';
import {
  GetBadgeUserDashboard,
  MarkBadgeNotificationRead,
  SetBadgeAwardVisibility,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuid = z.string().uuid();
const visibilityBody = z.discriminatedUnion('visibility', [
  z.object({ visibility: z.literal('PRIVATE'), sharedGroupId: z.null() }).strict(),
  z.object({ visibility: z.literal('GROUP'), sharedGroupId: uuid }).strict(),
]);

async function actorUserId() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}

async function respond(request: Request, operation: () => Promise<unknown>) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

const dto = (value: Awaited<ReturnType<GetBadgeUserDashboard['execute']>>) => ({
  ...value,
  acquired: value.acquired.map((item) => ({
    ...item,
    awardedAt: item.awardedAt?.toISOString() ?? null,
  })),
  inProgress: value.inProgress.map((item) => ({ ...item, awardedAt: null })),
  recommended: value.recommended.map((item) => ({ ...item, awardedAt: null })),
  notifications: value.notifications.map((item) => ({
    ...item,
    awardedAt: item.awardedAt.toISOString(),
    readAt: item.readAt?.toISOString() ?? null,
  })),
});

export function getBadgeDashboardResponse(request: Request, workspaceId: string) {
  return respond(request, async () => {
    const db = await import('@bunshin/database');
    return dto(
      await new GetBadgeUserDashboard(
        new db.PrismaBadgeUserExperienceRepository(db.prisma),
      ).execute({ workspaceId: uuid.parse(workspaceId), actorUserId: await actorUserId() }),
    );
  });
}

export function markBadgeNotificationReadResponse(
  request: Request,
  workspaceId: string,
  notificationId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const db = await import('@bunshin/database');
    return new MarkBadgeNotificationRead(
      new db.PrismaBadgeUserExperienceRepository(db.prisma),
    ).execute({
      workspaceId: uuid.parse(workspaceId),
      actorUserId: await actorUserId(),
      notificationId: uuid.parse(notificationId),
    });
  });
}

export function updateBadgeVisibilityResponse(
  request: Request,
  workspaceId: string,
  badgeAwardId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
    const body = visibilityBody.safeParse(await request.json());
    if (!body.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const db = await import('@bunshin/database');
    return new SetBadgeAwardVisibility(
      new db.PrismaBadgeUserExperienceRepository(db.prisma),
    ).execute({
      workspaceId: uuid.parse(workspaceId),
      actorUserId: await actorUserId(),
      badgeAwardId: uuid.parse(badgeAwardId),
      ...body.data,
    });
  });
}
