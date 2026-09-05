import 'server-only';

import { EnqueueJob } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger } from '@bunshin/observability';
import { currentLineEnvironment } from '../line/secure-configuration';

export async function queueMemberTrackingLinkResultNotification(input: {
  workspaceId: string;
  groupId: string;
  linkId: string;
  actorUserId: string;
  serviceSlug: string;
  serviceName: string;
  result: 'ACTIVATED' | 'REVISION_REQUESTED';
}) {
  const logger = createLogger().child({
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    linkId: input.linkId,
    route: '/service-external-tracking/member-result-notification',
  });
  try {
    const db = await import('@bunshin/database');
    const environment = currentLineEnvironment();
    const link = await db.prisma.externalTrackingLink.findFirst({
      where: {
        id: input.linkId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        scopeType: 'MEMBER',
        memberIdentityId: { not: null },
      },
      select: {
        system: { select: { name: true } },
        memberIdentity: {
          select: {
            groupMembershipId: true,
            groupMembership: { select: { userId: true, status: true, consentedAt: true } },
          },
        },
      },
    });
    const memberIdentity = link?.memberIdentity;
    const membership = memberIdentity?.groupMembership;
    if (
      !link ||
      !memberIdentity ||
      !membership ||
      membership.status !== 'ACTIVE' ||
      !membership.consentedAt
    )
      return { status: 'SKIPPED' as const, reason: 'MEMBER_UNAVAILABLE' };

    const [connection, configuration] = await Promise.all([
      db.prisma.groupLineConnection.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: memberIdentity.groupMembershipId,
          userId: membership.userId,
          status: 'ACTIVE',
          notificationConsentAt: { not: null },
          friendshipStatus: 'FOLLOWING',
        },
        select: { id: true },
      }),
      db.prisma.groupLineChannelConfiguration.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment,
          status: 'ACTIVE',
          lastVerifiedAt: { not: null },
          lastErrorCategory: null,
          globallyPaused: false,
        },
        select: { id: true },
      }),
    ]);
    if (!connection || !configuration)
      return { status: 'SKIPPED' as const, reason: 'LINE_UNAVAILABLE' };

    const resultUrl = new URL(
      `/s/${encodeURIComponent(input.serviceSlug)}/tracking-link`,
      getServerEnvironment().APP_URL,
    ).toString();
    const title =
      input.result === 'ACTIVATED' ? '専用URLを使用できます' : '専用URLを確認してください';
    const message =
      input.result === 'ACTIVATED'
        ? `${input.serviceName}からのお知らせです。\n\n${link.system.name}の専用URLを確認しました。今後作成する商品紹介の投稿案で使用できます。\n\n確認する：${resultUrl}`
        : `${input.serviceName}からのお知らせです。\n\n${link.system.name}の専用URLをもう一度確認してください。現在のURLは投稿案には使用されません。正しい専用URLを登録し直してください。\n\n登録し直す：${resultUrl}`;
    const scheduledAt = new Date();
    const broadcast = await db.prisma.$transaction(async (tx) => {
      const row = await tx.serviceLineBroadcast.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          title,
          message,
          segmentCriteria: { kind: 'MEMBER_TRACKING_LINK_RESULT', linkId: input.linkId },
          status: 'SCHEDULED',
          scheduledAt,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.serviceLineBroadcastRecipient.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          broadcastId: row.id,
          groupMembershipId: memberIdentity.groupMembershipId,
          userId: membership.userId,
        },
      });
      await tx.serviceLineBroadcastAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          broadcastId: row.id,
          action: 'SCHEDULED',
          beforeData: {},
          afterData: { recipients: 1, result: input.result, linkId: input.linkId, environment },
          reason: '参加者本人が登録した専用URLの確認結果を通知',
          performedByUserId: input.actorUserId,
        },
      });
      return row;
    });
    await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
      environment,
      workspaceId: input.workspaceId,
      correlationId: `member-tracking-link-result:${input.linkId}`,
      requestedBy: input.actorUserId,
      jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
      payloadReference: `service-line-broadcast:${broadcast.id}`,
      idempotencyKey: `member-tracking-link-result:${input.linkId}:${input.result}:${scheduledAt.toISOString()}`,
      priority: 30,
      maxAttempts: 3,
      scheduledAt,
    });
    return { status: 'QUEUED' as const, broadcastId: broadcast.id };
  } catch (error) {
    logger.error('member tracking link result notification was not queued', {
      status: 'failed',
      result: input.result,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { status: 'SKIPPED' as const, reason: 'QUEUE_FAILED' };
  }
}
