import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { resolveManagedServiceContext } from '../services/public-service';
import { readServiceOnboardingSettings } from '../services/service-onboarding-settings';
import { buildBusinessPilotMetrics } from '../services/business-pilot-metrics';
import { sumBusinessOutcomes } from '../services/business-outcomes';

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
    const now = new Date();
    const onboarding = readServiceOnboardingSettings(
      service.configuration.registration.onboardingConfig,
      service.configuration.registration.surveyConfig,
    );
    const [participantRows, activityRows, lineOpenRows, outcomeRows, lineSent] =
      onboarding.businessProfileEnabled
        ? await Promise.all([
            db.prisma.groupMembership.findMany({
              where: {
                workspaceId: service.workspaceId,
                groupId: service.serviceId,
                status: 'ACTIVE',
                serviceRole: 'PARTICIPANT',
              },
              select: { userId: true, createdAt: true },
            }),
            db.prisma.missionActivity.findMany({
              where: { ...missionScope },
              select: { actorUserId: true, dailyMissionId: true, occurredAt: true, type: true },
            }),
            db.prisma.missionDeepLinkState.findMany({
              where: {
                workspaceId: service.workspaceId,
                consumedAt: { not: null },
                dailyMission: { is: { bunshin: { is: { groupId: service.serviceId } } } },
              },
              select: { userId: true, dailyMissionId: true, consumedAt: true },
            }),
            db.prisma.postRecord.findMany({
              where: {
                ...missionScope,
                postedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
              },
              select: { manualMetrics: true },
            }),
            db.prisma.lineMessageDelivery.count({
              where: {
                workspaceId: service.workspaceId,
                groupId: service.serviceId,
                status: 'SENT',
                sentAt: { gte: from },
              },
            }),
          ])
        : [[], [], [], [], 0];
    const events = [
      ...activityRows.map((row) => ({ userId: row.actorUserId, occurredAt: row.occurredAt })),
      ...lineOpenRows.flatMap((row) =>
        row.consumedAt ? [{ userId: row.userId, occurredAt: row.consumedAt }] : [],
      ),
    ];
    const opened = new Set(
      lineOpenRows
        .filter((row) => row.consumedAt && row.consumedAt >= from)
        .map((row) => row.dailyMissionId),
    ).size;
    const viewed = new Set(
      activityRows
        .filter((row) => row.type === 'VIEWED' && row.occurredAt >= from)
        .map((row) => row.dailyMissionId),
    ).size;
    const pilotMetrics = buildBusinessPilotMetrics({
      participants: participantRows.map(({ userId, createdAt }) => ({
        userId,
        joinedAt: createdAt,
      })),
      events,
      now,
      missions,
      viewed,
      accepted,
      copied,
      posted,
      lineSent,
      lineOpened: opened,
    });
    const outcomes = sumBusinessOutcomes(outcomeRows.map(({ manualMetrics }) => manualMetrics));
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
        'LINE開封率',
        '投稿案閲覧率',
        '採用率',
        'コピー率',
        '投稿完了率',
        '7日継続率',
        '30日継続率',
        '直近7日で3日以上利用',
        '問い合わせ（30日）',
        '予約（30日）',
        '来店（30日）',
        '再予約（30日）',
        '再来店（30日）',
        '購入・申込（30日）',
        'その他の反応（30日）',
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
        pilotMetrics.openRate ?? '',
        pilotMetrics.viewRate ?? '',
        pilotMetrics.acceptanceRate ?? '',
        pilotMetrics.copyRate ?? '',
        pilotMetrics.postRate ?? '',
        pilotMetrics.sevenDayRetention.percent ?? '',
        pilotMetrics.thirtyDayRetention.percent ?? '',
        pilotMetrics.threeDayActiveUsers,
        outcomes.inquiries,
        outcomes.reservations,
        outcomes.visits,
        outcomes.repeatReservations,
        outcomes.repeatVisits,
        outcomes.orders,
        outcomes.other,
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
