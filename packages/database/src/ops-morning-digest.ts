import type {
  OpsMorningDigestBroadcastCount,
  OpsMorningDigestCollectorResult,
  OpsMorningDigestDateWindow,
  OpsMorningDigestInvoiceCount,
} from '@bunshin/application';
import { type PrismaClient, prisma } from './client';

const FORTUNE_AUTOMATION_PREFIX = 'fortune-weekly:';
const unavailable = {
  status: 'UNAVAILABLE',
  errorCategory: 'DATABASE_READ_FAILED',
} as const satisfies OpsMorningDigestCollectorResult<never>;

type BroadcastGroup = {
  groupId: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  _count: { _all: number };
};

type FortuneSchedule = {
  timeZone: string;
  weeklyNotificationDay: number;
  weeklyNotificationHour: number;
};

const isDeliveryDate = (window: OpsMorningDigestDateWindow, schedule: FortuneSchedule) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: schedule.timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const weekday: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  for (
    let instant = window.from.getTime();
    instant < window.to.getTime();
    instant += 15 * 60 * 1_000
  ) {
    const parts = formatter.formatToParts(new Date(instant));
    const weekdayLabel = parts.find((part) => part.type === 'weekday')?.value ?? '';
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    if (
      weekday[weekdayLabel] === schedule.weeklyNotificationDay &&
      hour >= schedule.weeklyNotificationHour
    )
      return true;
  }
  return false;
};

const eventDateFilter = (window: OpsMorningDigestDateWindow) => ({
  OR: [
    { status: 'SCHEDULED' as const, scheduledAt: { gte: window.from, lt: window.to } },
    { status: 'COMPLETED' as const, completedAt: { gte: window.from, lt: window.to } },
    { status: 'CANCELLED' as const, cancelledAt: { gte: window.from, lt: window.to } },
  ],
});

const missingEventDateFilter = {
  OR: [
    { status: 'SCHEDULED' as const, scheduledAt: null },
    { status: 'COMPLETED' as const, completedAt: null },
    { status: 'CANCELLED' as const, cancelledAt: null },
  ],
};

const incompleteSource = {
  status: 'UNAVAILABLE',
  errorCategory: 'SOURCE_DATA_INCOMPLETE',
} as const satisfies OpsMorningDigestCollectorResult<never>;

function serviceCounts(
  rows: BroadcastGroup[],
  serviceByGroup: Map<string, { displayName: string }>,
): OpsMorningDigestBroadcastCount[] {
  return rows
    .map((row) => ({
      serviceName: serviceByGroup.get(row.groupId)?.displayName ?? '対象サービス',
      status: row.status,
      count: row._count._all,
    }))
    .sort(
      (left, right) =>
        left.serviceName.localeCompare(right.serviceName, 'ja') ||
        left.status.localeCompare(right.status),
    );
}

export class PrismaOpsMorningDigestCollector {
  constructor(private readonly client: PrismaClient = prisma) {}

  async serviceLineBroadcasts(input: OpsMorningDigestDateWindow): Promise<{
    serviceBroadcasts: OpsMorningDigestCollectorResult<OpsMorningDigestBroadcastCount[]>;
    fortuneWeeklyBroadcasts: OpsMorningDigestCollectorResult<OpsMorningDigestBroadcastCount[]>;
  }> {
    try {
      const [
        serviceRows,
        fortuneRows,
        incompleteServiceRows,
        incompleteFortuneRows,
        fortuneSchedules,
      ] = await Promise.all([
        this.client.serviceLineBroadcast.groupBy({
          by: ['groupId', 'status'],
          where: {
            AND: [
              eventDateFilter(input),
              {
                OR: [
                  { automationKey: null },
                  { automationKey: { not: { startsWith: FORTUNE_AUTOMATION_PREFIX } } },
                ],
              },
            ],
          },
          _count: { _all: true },
        }),
        this.client.serviceLineBroadcast.groupBy({
          by: ['groupId', 'status'],
          where: {
            AND: [
              eventDateFilter(input),
              { automationKey: { startsWith: FORTUNE_AUTOMATION_PREFIX } },
            ],
          },
          _count: { _all: true },
        }),
        this.client.serviceLineBroadcast.groupBy({
          by: ['groupId', 'status'],
          where: {
            AND: [
              missingEventDateFilter,
              {
                OR: [
                  { automationKey: null },
                  { automationKey: { not: { startsWith: FORTUNE_AUTOMATION_PREFIX } } },
                ],
              },
            ],
          },
          _count: { _all: true },
        }),
        this.client.serviceLineBroadcast.groupBy({
          by: ['groupId', 'status'],
          where: {
            AND: [
              missingEventDateFilter,
              { automationKey: { startsWith: FORTUNE_AUTOMATION_PREFIX } },
            ],
          },
          _count: { _all: true },
        }),
        this.client.fortuneServiceSetting.findMany({
          where: {
            enabled: true,
            weeklyNotificationEnabled: true,
            group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
            configuration: {
              is: {
                registration: { is: { lineEnabled: true } },
                AND: [
                  { OR: [{ startsAt: null }, { startsAt: { lt: input.to } }] },
                  { OR: [{ endsAt: null }, { endsAt: { gt: input.from } }] },
                ],
              },
            },
          },
          select: { timeZone: true, weeklyNotificationDay: true, weeklyNotificationHour: true },
        }),
      ]);
      const groups = [...new Set([...serviceRows, ...fortuneRows].map((row) => row.groupId))];
      const services = groups.length
        ? await this.client.serviceConfiguration.findMany({
            where: { groupId: { in: groups } },
            select: { groupId: true, displayName: true },
          })
        : [];
      const serviceByGroup = new Map(services.map((service) => [service.groupId, service]));
      const serviceBroadcasts: OpsMorningDigestCollectorResult<OpsMorningDigestBroadcastCount[]> = {
        status: 'OK',
        value: serviceCounts(serviceRows as BroadcastGroup[], serviceByGroup),
      };
      const hasFortuneBroadcast = fortuneRows.length > 0;
      let hasScheduledFortuneDelivery: boolean;
      try {
        hasScheduledFortuneDelivery = fortuneSchedules.some((schedule) =>
          isDeliveryDate(input, schedule),
        );
      } catch {
        return {
          serviceBroadcasts,
          fortuneWeeklyBroadcasts: {
            status: 'UNAVAILABLE',
            errorCategory: 'INVALID_SOURCE_CONFIGURATION',
          },
        };
      }
      const fortuneWeeklyBroadcasts: OpsMorningDigestCollectorResult<
        OpsMorningDigestBroadcastCount[]
      > =
        hasFortuneBroadcast || hasScheduledFortuneDelivery
          ? { status: 'OK', value: serviceCounts(fortuneRows as BroadcastGroup[], serviceByGroup) }
          : { status: 'NOT_APPLICABLE', reason: 'NO_SCHEDULED_FORTUNE_DELIVERY' };
      return {
        serviceBroadcasts: incompleteServiceRows.length > 0 ? incompleteSource : serviceBroadcasts,
        fortuneWeeklyBroadcasts:
          incompleteFortuneRows.length > 0 ? incompleteSource : fortuneWeeklyBroadcasts,
      };
    } catch {
      return { serviceBroadcasts: unavailable, fortuneWeeklyBroadcasts: unavailable };
    }
  }

  async tenantInvoiceStatuses(): Promise<
    OpsMorningDigestCollectorResult<OpsMorningDigestInvoiceCount[]>
  > {
    try {
      const rows = await this.client.tenantInvoice.groupBy({
        by: ['status'],
        _count: { _all: true },
      });
      return {
        status: 'OK',
        value: rows.map((row) => ({ status: row.status, count: row._count._all })),
      };
    } catch {
      return unavailable;
    }
  }
}
