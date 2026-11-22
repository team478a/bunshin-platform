import 'server-only';
import { toJapanLocalDate } from '@bunshin/capability-fortune';
import type { PrismaClient } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import { funnelTopics, optionalAcquisitionTag } from './funnel';

type Scope = { workspaceId: string; groupId: string };
export const revenueMonth = z.string().regex(/^20\d\d-(0[1-9]|1[0-2])$/);
export const currentRevenueMonth = () => toJapanLocalDate(new Date()).slice(0, 7);
const ratio = (value: number, denominator: number) => (denominator ? value / denominator : null);
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

const accountingAmount = (max: number) =>
  z.preprocess(
    (value) => (value === null || value === '' ? undefined : value),
    z.coerce.number().int().min(0).max(max),
  );

export async function saveAdvertisingSpend(db: PrismaClient, scope: Scope, input: unknown) {
  const data = z
    .object({
      month: revenueMonth,
      channel: z.string().transform(optionalAcquisitionTag).pipe(z.string()),
      amountYen: accountingAmount(1_000_000_000),
    })
    .parse(input);
  const setting = await db.fortuneServiceSetting.findFirst({ where: scope, select: { id: true } });
  if (!setting) throw new ApplicationError('NOT_FOUND', '占い設定を確認できません。');
  const key = { ...scope, month: data.month, channel: data.channel };
  await db.fortuneAdvertisingSpend.upsert({
    where: { workspaceId_groupId_month_channel: key },
    create: { ...key, serviceSettingId: setting.id, amountYen: data.amountYen },
    update: { amountYen: data.amountYen },
  });
}

export async function saveVerifiedStripeFee(db: PrismaClient, scope: Scope, input: unknown) {
  const data = z
    .object({
      purchaseId: z.string().uuid(),
      amountYen: accountingAmount(99_999_999),
    })
    .parse(input);
  const updated = await db.fortuneCommercePurchase.updateMany({
    where: { ...scope, id: data.purchaseId, paidAt: { not: null } },
    data: { stripeFeeYen: data.amountYen },
  });
  if (updated.count !== 1) throw new ApplicationError('NOT_FOUND', '購入を確認できません。');
}

export async function fortuneRevenue(
  db: PrismaClient,
  scope: Scope,
  { month, fx, liveMode }: { month: string; fx: number | null; liveMode: boolean },
) {
  const start = new Date(`${month}-01T00:00:00+09:00`);
  const [year, calendarMonth] = month.split('-').map(Number) as [number, number];
  const end = new Date(Date.UTC(year, calendarMonth, 1, -9));
  const window = { gte: start, lt: end };
  const within = (date: Date | null) => date !== null && date >= start && date < end;
  const setting = await db.fortuneServiceSetting.findFirst({
    where: scope,
    select: { id: true, bunshinId: true },
  });
  if (!setting) throw new ApplicationError('NOT_FOUND', '占い設定を確認できません。');
  const [orders, events, costs, spend, visits, ratings] = await Promise.all([
    db.fortuneCommercePurchase.findMany({
      where: { ...scope, liveMode, OR: [{ paidAt: { lt: end } }, { createdAt: window }] },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        buyerUserId: true,
        groupMembershipId: true,
        productName: true,
        amountYen: true,
        status: true,
        paidAt: true,
        deliveredAt: true,
        refundedAt: true,
        updatedAt: true,
        createdAt: true,
        paymentFailedAt: true,
        refundedAmountYen: true,
        stripeFeeYen: true,
        acquisitionChannel: true,
        providerCheckoutSessionId: true,
        refunds: {
          where: { occurredAt: { lt: end } },
          orderBy: { observedAmountYen: 'asc' },
          select: { observedAmountYen: true, occurredAt: true },
        },
      },
    }),
    db.serviceMembershipEvent.findMany({
      where: {
        ...scope,
        occurredAt: window,
        eventType: {
          in: ['FORTUNE_FUNNEL', 'REGISTRATION_COMPLETED', 'SERVICE_REVISITED'],
        },
      },
      select: { userId: true, groupMembershipId: true, eventType: true, topic: true },
    }),
    db.aiUsageEvent.findMany({
      where: {
        workspaceId: scope.workspaceId,
        bunshinId: setting.bunshinId,
        taskType: 'FORTUNE_DAILY_READING',
        occurredAt: { lt: end },
        idempotencyKey: { startsWith: 'fortune-purchase:' },
      },
      select: { idempotencyKey: true, estimatedCostUsdMicros: true },
    }),
    db.fortuneAdvertisingSpend.findMany({
      where: { ...scope, month },
      select: { channel: true, amountYen: true },
    }),
    db.fortuneAcquisitionVisit.groupBy({
      by: ['channel'],
      where: { ...scope, occurredAt: window },
      _count: { _all: true },
    }),
    db.fortuneFeedback.count({
      where: { ...scope, serviceSettingId: setting.id, createdAt: window },
    }),
  ]);
  const ai = new Map<string, { usd: number; complete: boolean }>();
  for (const cost of costs) {
    const purchaseId = cost.idempotencyKey.split(':')[1]!;
    const value = ai.get(purchaseId) ?? { usd: 0, complete: true };
    if (cost.estimatedCostUsdMicros === null) value.complete = false;
    else value.usd += Number(cost.estimatedCostUsdMicros) / 1_000_000;
    ai.set(purchaseId, value);
  }
  const first = new Map<string, string>();
  const paid = orders.filter((order) => order.paidAt);
  const refundTotalAt = (order: (typeof orders)[number]) =>
    order.refunds.at(-1)?.observedAmountYen ??
    (order.refundedAt && order.refundedAt < end ? order.refundedAmountYen : 0);
  const aggregate = (items: typeof orders) => {
    const gross = sum(items.map(({ amountYen }) => amountYen));
    const refunds = sum(items.map(refundTotalAt));
    const fees = items.every(({ stripeFeeYen }) => stripeFeeYen !== null)
      ? sum(items.map(({ stripeFeeYen }) => stripeFeeYen!))
      : null;
    const rawCosts = items.map(({ id }) => ai.get(id));
    const knownAi = sum(rawCosts.map((row) => row?.usd ?? 0));
    const allAiKnown = rawCosts.every((row) => row?.complete);
    const margin =
      fees !== null && allAiKnown && fx !== null ? gross - refunds - fees - knownAi * fx : null;
    return { gross, refunds, fees, knownAi, allAiKnown, margin, count: items.length };
  };
  const customers = new Map<string, typeof orders>();
  for (const order of paid) {
    if (!first.has(order.buyerUserId)) first.set(order.buyerUserId, order.id);
    const previous = customers.get(order.buyerUserId) ?? [];
    previous.push(order);
    customers.set(order.buyerUserId, previous);
  }
  const monthly = paid.filter((order) => within(order.paidAt));
  const newBuyers = monthly.filter((order) => first.get(order.buyerUserId) === order.id);
  const repeatOrders = monthly.filter((order) => first.get(order.buyerUserId) !== order.id);
  const buyerCount = new Set(monthly.map(({ buyerUserId }) => buyerUserId)).size;
  const registered = new Set(
    events
      .filter(({ eventType }) => eventType === 'REGISTRATION_COMPLETED')
      .map(({ userId }) => userId),
  );
  const free = new Set(
    events.filter(({ topic }) => topic === 'FREE_COMPLETE').map(({ userId }) => userId),
  );
  const countEvents = (topic: string) => events.filter((event) => event.topic === topic).length;
  const channelFor = (order: (typeof orders)[number]) => order.acquisitionChannel ?? 'unknown';
  const channels = Array.from(
    new Set([
      ...visits.map(({ channel }) => channel),
      ...spend.map(({ channel }) => channel),
      ...monthly.map(channelFor),
    ]),
  )
    .sort()
    .map((channel) => {
      const channelOrders = monthly.filter((order) => channelFor(order) === channel);
      const acquired = newBuyers.filter((order) => channelFor(order) === channel).length;
      const advertisingCost = spend.find((item) => item.channel === channel)?.amountYen ?? null;
      const total = aggregate(channelOrders);
      const visitsCount = visits.find((item) => item.channel === channel)?._count._all ?? 0;
      return {
        ...total,
        channel,
        acquired,
        advertisingCost,
        visitsCount,
        acquisitionRate: ratio(acquired, visitsCount),
        cac: advertisingCost === null ? null : ratio(advertisingCost, acquired),
      };
    });
  const products = Array.from(
    new Set(monthly.map(({ productName, amountYen }) => JSON.stringify([productName, amountYen]))),
  ).map((key) => {
    const [name, price] = JSON.parse(key) as [string, number];
    return {
      name,
      price,
      ...aggregate(
        monthly.filter((order) => order.productName === name && order.amountYen === price),
      ),
    };
  });
  const monthRefunds = paid.flatMap((order) => {
    let previous = 0;
    if (!order.refunds.length && within(order.refundedAt)) return [order.refundedAmountYen];
    return order.refunds.flatMap((row) => {
      const difference = row.observedAmountYen - previous;
      previous = row.observedAmountYen;
      return within(row.occurredAt) ? [difference] : [];
    });
  });
  const total = aggregate(monthly);
  const lifetime = aggregate(paid);
  const adTotal =
    channels.length && channels.every(({ advertisingCost }) => advertisingCost !== null)
      ? sum(channels.map(({ advertisingCost }) => advertisingCost!))
      : null;

  return {
    total,
    products,
    channels,
    buyerCount,
    firstPurchaseRate: ratio(
      newBuyers.filter(({ buyerUserId }) => registered.has(buyerUserId)).length,
      registered.size,
    ),
    repeatPurchaseRate: ratio(
      new Set(repeatOrders.map(({ buyerUserId }) => buyerUserId)).size,
      buyerCount,
    ),
    freeConversion: ratio(
      new Set(
        monthly
          .filter(({ buyerUserId }) => free.has(buyerUserId))
          .map(({ buyerUserId }) => buyerUserId),
      ).size,
      free.size,
    ),
    refundCount: monthRefunds.length,
    refundYen: sum(monthRefunds),
    adTotal,
    contributionPerOrder: total.margin === null ? null : ratio(total.margin, total.count),
    cac: adTotal === null ? null : ratio(adTotal, newBuyers.length),
    observedLtvRevenue: ratio(lifetime.gross - lifetime.refunds, customers.size),
    observedLtvMargin: lifetime.margin === null ? null : ratio(lifetime.margin, customers.size),
    purchasesPerCustomer: ratio(lifetime.count, customers.size),
    funnel: {
      LP_VISIT: sum(visits.map(({ _count }) => _count._all)),
      REGISTRATION: registered.size,
      ...Object.fromEntries(funnelTopics.map((topic) => [topic, countEvents(topic)])),
      CHECKOUT: orders.filter(
        ({ createdAt, providerCheckoutSessionId }) =>
          within(createdAt) && providerCheckoutSessionId,
      ).length,
      PAID: monthly.length,
      FAILED_OR_EXPIRED: orders.filter(
        ({ paymentFailedAt, status, updatedAt }) =>
          within(paymentFailedAt) || (status === 'EXPIRED' && within(updatedAt)),
      ).length,
      DELIVERED: paid.filter(({ deliveredAt }) => within(deliveredAt)).length,
      RATING: ratings,
      REVISIT: events.filter(({ eventType }) => eventType === 'SERVICE_REVISITED').length,
      REPEAT: repeatOrders.length,
      REFUND: monthRefunds.length,
    } as Record<string, number>,
  };
}
