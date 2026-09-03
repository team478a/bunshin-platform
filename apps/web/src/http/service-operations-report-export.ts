import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { resolveManagedServiceContext } from '../services/public-service';

const escapeCsv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export async function serviceOperationsReportExportResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const db = await import('@bunshin/database');
    const missionScope = {
      workspaceId: service.workspaceId,
      bunshin: { is: { groupId: service.serviceId } },
    };
    const [
      participants,
      missions,
      accepted,
      rejected,
      copied,
      posted,
      trends,
      aiSuccessful,
      aiFailed,
    ] = await Promise.all([
      db.prisma.groupMembership.count({
        where: { workspaceId: service.workspaceId, groupId: service.serviceId, status: 'ACTIVE' },
      }),
      db.prisma.dailyMission.count({ where: { ...missionScope, createdAt: { gte: from } } }),
      db.prisma.missionDecision.count({
        where: { ...missionScope, decision: 'ACCEPTED', decidedAt: { gte: from } },
      }),
      db.prisma.missionDecision.count({
        where: { ...missionScope, decision: 'REJECTED', decidedAt: { gte: from } },
      }),
      db.prisma.missionActivity.count({
        where: {
          ...missionScope,
          occurredAt: { gte: from },
          type: {
            in: [
              'COPIED_TEXT',
              'COPIED_SLIDE',
              'COPIED_IMAGE_INSTRUCTION',
              'COPIED_VIDEO_PROMPT',
              'COPIED_SCRIPT',
            ],
          },
        },
      }),
      db.prisma.postRecord.count({ where: { ...missionScope, postedAt: { gte: from } } }),
      db.prisma.missionTrendContext.count({
        where: { createdAt: { gte: from }, dailyMission: { is: missionScope } },
      }),
      db.prisma.aiUsageEvent.count({
        where: {
          workspaceId: service.workspaceId,
          occurredAt: { gte: from },
          status: 'SUCCESS',
          bunshin: { is: { groupId: service.serviceId } },
        },
      }),
      db.prisma.aiUsageEvent.count({
        where: {
          workspaceId: service.workspaceId,
          occurredAt: { gte: from },
          status: 'FAILED',
          bunshin: { is: { groupId: service.serviceId } },
        },
      }),
    ]);
    const body = [
      [
        '集計開始日',
        '集計終了日',
        '参加者数',
        '投稿案',
        '採用',
        '不採用',
        'コピー',
        '投稿完了',
        '話題を使った投稿案',
        'AI成功',
        'AI要確認',
      ],
      [
        from.toISOString().slice(0, 10),
        new Date().toISOString().slice(0, 10),
        participants,
        missions,
        accepted,
        rejected,
        copied,
        posted,
        trends,
        aiSuccessful,
        aiFailed,
      ],
    ]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\r\n');
    return new Response(`\uFEFF${body}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="service-operations-${service.configuration.slug}.csv"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
