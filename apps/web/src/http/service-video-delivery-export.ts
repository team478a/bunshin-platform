import 'server-only';
import { currentUserProvider } from '../auth/current-user';
import { resolveManagedServiceContext } from '../services/public-service';
import { csv } from './admin-report-export';

const deliveryStatusLabel: Record<string, string> = {
  ASSIGNED: '未確認',
  VIEWED: '確認中',
  ACCEPTED: '採用済み',
  DECLINED: '今回は使わない',
  POSTED: '投稿完了',
  EXPIRED: '利用期限切れ',
  REVOKED: '利用停止',
};

const deliveryNotificationLabel: Record<string, string> = {
  PENDING: '未送信',
  SENT: 'LINEでお知らせ済み',
  FAILED: '送信に失敗',
  CANCELLED: '送信していません',
};

type VideoDeliveryCsvRow = {
  groupMembershipId: string;
  videoProjectId: string;
  status: string;
  notificationStatus: string;
  notificationAttemptCount: number;
  createdAt: Date;
  notifiedAt: Date | null;
  viewedAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  postedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

type VideoDeliveryCsvMembership = {
  id: string;
  user: { displayName: string | null };
};

type VideoDeliveryCsvProject = { id: string; title: string };

export async function exportServiceVideoDeliveriesCsvResponse(serviceSlug: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) {
    return new Response(null, { status: 401, headers: { 'cache-control': 'private, no-store' } });
  }
  try {
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const deliveries: VideoDeliveryCsvRow[] = await db.prisma.videoDelivery.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      select: {
        groupMembershipId: true,
        videoProjectId: true,
        status: true,
        notificationStatus: true,
        notificationAttemptCount: true,
        createdAt: true,
        notifiedAt: true,
        viewedAt: true,
        acceptedAt: true,
        declinedAt: true,
        postedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
    const [memberships, projects]: [VideoDeliveryCsvMembership[], VideoDeliveryCsvProject[]] =
      await Promise.all([
        db.prisma.groupMembership.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            id: { in: [...new Set(deliveries.map((delivery) => delivery.groupMembershipId))] },
          },
          select: { id: true, user: { select: { displayName: true } } },
        }),
        db.prisma.videoProject.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            id: { in: [...new Set(deliveries.map((delivery) => delivery.videoProjectId))] },
          },
          select: { id: true, title: true },
        }),
      ]);
    const memberNameById = new Map(
      memberships.map((membership) => [membership.id, membership.user.displayName]),
    );
    const projectTitleById = new Map(projects.map((project) => [project.id, project.title]));
    const headers = [
      '参加者',
      '動画名',
      '利用者の状態',
      'LINE通知',
      '通知の試行回数',
      '確認依頼',
      'LINE通知の確認',
      '動画を確認',
      '採用',
      '今回は使わない',
      '投稿完了',
      '利用期限',
      '利用停止',
    ];
    const rows: Array<Array<string | number | null>> = [
      headers,
      ...deliveries.map((delivery) => [
        memberNameById.get(delivery.groupMembershipId) ?? '参加者',
        projectTitleById.get(delivery.videoProjectId) ?? '動画',
        deliveryStatusLabel[delivery.status] ?? delivery.status,
        deliveryNotificationLabel[delivery.notificationStatus] ?? delivery.notificationStatus,
        delivery.notificationAttemptCount,
        delivery.createdAt.toISOString(),
        delivery.notifiedAt?.toISOString() ?? null,
        delivery.viewedAt?.toISOString() ?? null,
        delivery.acceptedAt?.toISOString() ?? null,
        delivery.declinedAt?.toISOString() ?? null,
        delivery.postedAt?.toISOString() ?? null,
        delivery.expiresAt?.toISOString() ?? null,
        delivery.revokedAt?.toISOString() ?? null,
      ]),
    ];
    return new Response(csv(rows), {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': 'attachment; filename="video-deliveries.csv"',
        'content-type': 'text/csv; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: { 'cache-control': 'private, no-store' } });
  }
}
