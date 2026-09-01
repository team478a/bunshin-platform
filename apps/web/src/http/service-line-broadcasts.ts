import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from '../line/secure-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';
import { resolveManagedServiceContext } from '../services/public-service';

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(5000),
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.literal(true),
});

export async function listServiceLineBroadcastsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const rows = await db.prisma.serviceLineBroadcast.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      include: { recipients: { select: { status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return Response.json({
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
        recipients: row.recipients.reduce<Record<string, number>>((result, item) => {
          result[item.status] = (result[item.status] ?? 0) + 1;
          return result;
        }, {}),
      })),
      requestId,
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function sendServiceLineBroadcastResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = createSchema.parse(await request.json());
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const environment = currentLineEnvironment();
    const configuration = await db.prisma.groupLineChannelConfiguration.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        environment,
        status: 'ACTIVE',
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
        globallyPaused: false,
      },
      select: { encryptedAccessToken: true },
    });
    if (!configuration)
      throw new ApplicationError('CONFLICT', 'active service LINE configuration required');
    const recipients = await db.prisma.groupLineConnection.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
        notificationConsentAt: { not: null },
        friendshipStatus: 'FOLLOWING',
        groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
        user: { status: 'ACTIVE' },
      },
      select: { groupMembershipId: true, userId: true, providerUserId: true },
      take: 500,
    });
    if (!recipients.length) throw new ApplicationError('CONFLICT', 'no eligible LINE recipients');
    const broadcast = await db.prisma.$transaction(async (tx) => {
      const row = await tx.serviceLineBroadcast.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          title: value.title,
          message: value.message,
          status: 'SCHEDULED',
          scheduledAt: new Date(),
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        },
      });
      await tx.serviceLineBroadcastRecipient.createMany({
        data: recipients.map((recipient) => ({
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          broadcastId: row.id,
          groupMembershipId: recipient.groupMembershipId,
          userId: recipient.userId,
        })),
      });
      await tx.serviceLineBroadcastAuditLog.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          broadcastId: row.id,
          action: 'SENT_REQUESTED',
          beforeData: {},
          afterData: { recipients: recipients.length, environment },
          reason: value.reason,
          performedByUserId: actor.userId,
        },
      });
      return row;
    });
    const token = new AesGcmLineSecretCrypto().decrypt(configuration.encryptedAccessToken);
    const provider = new LineMessagingApiAdapter();
    const outcomes = await Promise.all(
      recipients.map(async (recipient) => ({
        recipient,
        outcome: await provider.pushText({
          accessToken: token,
          recipientId: recipient.providerUserId,
          text: value.message,
        }),
      })),
    );
    await db.prisma.$transaction(async (tx) => {
      for (const { recipient, outcome } of outcomes) {
        await tx.serviceLineBroadcastRecipient.updateMany({
          where: { broadcastId: broadcast.id, groupMembershipId: recipient.groupMembershipId },
          data: outcome.ok
            ? { status: 'SENT', deliveredAt: new Date() }
            : { status: 'FAILED', errorCategory: outcome.category },
        });
      }
      await tx.serviceLineBroadcast.update({
        where: { id: broadcast.id },
        data: { status: 'COMPLETED', completedAt: new Date(), updatedByUserId: actor.userId },
      });
    });
    return Response.json({
      data: {
        broadcastId: broadcast.id,
        requested: recipients.length,
        sent: outcomes.filter(({ outcome }) => outcome.ok).length,
        failed: outcomes.filter(({ outcome }) => !outcome.ok).length,
      },
      requestId,
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}
