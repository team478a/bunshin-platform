import type {
  LineConfigurationEnvironment,
  LineOperationalServiceBroadcastEvent,
} from '@bunshin/application';
import type { PrismaClient } from './client';

const JOB_TYPE = 'SERVICE_LINE_BROADCAST_DELIVER';
const JOB_REFERENCE_PREFIX = 'service-line-broadcast:';
const RECOVERY_KEY_PREFIX = 'service-line-broadcast-recovery:';
const ALERT_AUDIT_ACTION = 'OPERATION_ALERT_SENT';

const broadcastIdFromReference = (reference: string) =>
  reference.startsWith(JOB_REFERENCE_PREFIX) ? reference.slice(JOB_REFERENCE_PREFIX.length) : null;

export async function listServiceLineBroadcastOperationalEvents(
  client: PrismaClient,
  environment: LineConfigurationEnvironment,
  checkedAt: Date,
  options: { excludeNotified?: boolean } = {},
): Promise<LineOperationalServiceBroadcastEvent[]> {
  const stalledBefore = new Date(checkedAt.getTime() - 15 * 60 * 1_000);
  const recentSince = new Date(checkedAt.getTime() - 24 * 60 * 60 * 1_000);
  const recoverySince = new Date(checkedAt.getTime() - 2 * 60 * 60 * 1_000);
  const jobSelect = {
    id: true,
    payloadReference: true,
    idempotencyKey: true,
    status: true,
    updatedAt: true,
  } as const;
  const [unfinishedJobs, recentSucceededJobs] = await Promise.all([
    client.job.findMany({
      where: {
        environment,
        jobType: JOB_TYPE,
        status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED', 'DEAD'] },
      },
      select: jobSelect,
      orderBy: { updatedAt: 'desc' },
      take: 500,
    }),
    client.job.findMany({
      where: {
        environment,
        jobType: JOB_TYPE,
        status: 'SUCCEEDED',
        updatedAt: { gte: recentSince },
      },
      select: jobSelect,
      orderBy: { updatedAt: 'desc' },
      take: 500,
    }),
  ]);
  const serviceJobs = [
    ...new Map(
      [...unfinishedJobs, ...recentSucceededJobs].map((job) => [job.id, job] as const),
    ).values(),
  ];
  const environmentBroadcastIds = [
    ...new Set(
      serviceJobs.flatMap(
        ({ payloadReference }) => broadcastIdFromReference(payloadReference) ?? [],
      ),
    ),
  ];
  if (environmentBroadcastIds.length === 0) return [];
  const broadcasts = await client.serviceLineBroadcast.findMany({
    where: {
      id: { in: environmentBroadcastIds },
      OR: [
        { status: 'SCHEDULED', scheduledAt: { lte: stalledBefore } },
        { status: 'COMPLETED', completedAt: { gte: recentSince } },
      ],
    },
    select: {
      id: true,
      workspaceId: true,
      groupId: true,
      status: true,
      scheduledAt: true,
      completedAt: true,
      updatedByUserId: true,
      audits: {
        where: { action: ALERT_AUDIT_ACTION },
        select: { afterData: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });
  const broadcastIds = broadcasts.map(({ id }) => id);
  const groupIds = [...new Set(broadcasts.map(({ groupId }) => groupId))];
  const [recipientRows, serviceConfigurations] = await Promise.all([
    broadcastIds.length
      ? client.serviceLineBroadcastRecipient.groupBy({
          by: ['broadcastId', 'status'],
          where: { broadcastId: { in: broadcastIds } },
          _count: { _all: true },
        })
      : [],
    groupIds.length
      ? client.serviceConfiguration.findMany({
          where: { groupId: { in: groupIds } },
          select: { groupId: true, slug: true, displayName: true },
        })
      : [],
  ]);
  const serviceByGroup = new Map(serviceConfigurations.map((item) => [item.groupId, item]));
  const counts = new Map<string, { pending: number; sent: number; failed: number }>();
  for (const row of recipientRows) {
    const current = counts.get(row.broadcastId) ?? { pending: 0, sent: 0, failed: 0 };
    if (row.status === 'PENDING') current.pending += row._count._all;
    if (row.status === 'SENT') current.sent += row._count._all;
    if (row.status === 'FAILED') current.failed += row._count._all;
    counts.set(row.broadcastId, current);
  }
  const recoveryByBroadcast = new Map<
    string,
    Array<{ id: string; status: 'DEAD' | 'SUCCEEDED' }>
  >();
  for (const job of serviceJobs) {
    if (
      !job.idempotencyKey.startsWith(RECOVERY_KEY_PREFIX) ||
      (job.status === 'SUCCEEDED' && job.updatedAt < recoverySince)
    )
      continue;
    const broadcastId = broadcastIdFromReference(job.payloadReference);
    if (!broadcastId || (job.status !== 'DEAD' && job.status !== 'SUCCEEDED')) continue;
    const jobs = recoveryByBroadcast.get(broadcastId) ?? [];
    jobs.push({ id: job.id, status: job.status });
    recoveryByBroadcast.set(broadcastId, jobs);
  }
  const events: LineOperationalServiceBroadcastEvent[] = [];
  for (const broadcast of broadcasts) {
    const alreadyNotified = new Set(
      broadcast.audits.flatMap(({ afterData }) => {
        if (
          typeof afterData === 'object' &&
          afterData !== null &&
          !Array.isArray(afterData) &&
          typeof (afterData as { eventKey?: unknown }).eventKey === 'string'
        )
          return [(afterData as { eventKey: string }).eventKey];
        return [];
      }),
    );
    const add = (code: LineOperationalServiceBroadcastEvent['code'], discriminator: string) => {
      const eventKey = `${code}:${broadcast.id}:${discriminator}`;
      if (options.excludeNotified !== false && alreadyNotified.has(eventKey)) return;
      const service = serviceByGroup.get(broadcast.groupId);
      events.push({
        code,
        eventKey,
        workspaceId: broadcast.workspaceId,
        groupId: broadcast.groupId,
        broadcastId: broadcast.id,
        performedByUserId: broadcast.updatedByUserId,
        ...(service
          ? {
              serviceSlug: service.slug,
              serviceDisplayName: service.displayName,
            }
          : {}),
      });
    };
    const recipientCounts = counts.get(broadcast.id) ?? { pending: 0, sent: 0, failed: 0 };
    if (broadcast.status === 'SCHEDULED' && broadcast.scheduledAt && recipientCounts.pending > 0)
      add('SERVICE_BROADCAST_STALLED', broadcast.scheduledAt.toISOString());
    if (broadcast.status === 'COMPLETED' && broadcast.completedAt) {
      const attempted = recipientCounts.sent + recipientCounts.failed;
      const failureRate = attempted === 0 ? 0 : recipientCounts.failed / attempted;
      if (recipientCounts.failed > 0 && (recipientCounts.failed >= 5 || failureRate >= 0.5))
        add(
          'SERVICE_BROADCAST_HIGH_FAILURE',
          `${broadcast.completedAt.toISOString()}:${recipientCounts.failed}:${attempted}`,
        );
    }
    for (const job of recoveryByBroadcast.get(broadcast.id) ?? []) {
      if (job.status === 'DEAD') add('SERVICE_BROADCAST_RECOVERY_EXHAUSTED', job.id);
      if (
        job.status === 'SUCCEEDED' &&
        broadcast.status === 'COMPLETED' &&
        recipientCounts.failed === 0
      )
        add('SERVICE_BROADCAST_RECOVERED', job.id);
    }
  }
  return events;
}

export async function recordServiceLineBroadcastOperationalAlerts(
  client: PrismaClient,
  events: LineOperationalServiceBroadcastEvent[],
  fingerprint: string,
  notifiedAt: Date,
) {
  if (events.length === 0) return;
  await client.serviceLineBroadcastAuditLog.createMany({
    data: events.map((event) => ({
      workspaceId: event.workspaceId,
      groupId: event.groupId,
      broadcastId: event.broadcastId,
      action: ALERT_AUDIT_ACTION,
      afterData: {
        code: event.code,
        eventKey: event.eventKey,
        fingerprint,
        notifiedAt: notifiedAt.toISOString(),
      },
      reason: 'LINE一斉配信の運用監視通知を送信',
      performedByUserId: event.performedByUserId,
      occurredAt: notifiedAt,
    })),
  });
}
