const localParts = (now: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    weekday: weekdays[value('weekday')] ?? -1,
    hour: Number(value('hour')),
  };
};

export function isFortuneWeeklyNotificationDue(input: {
  now: Date;
  timeZone: string;
  weekday: number;
  hour: number;
}) {
  const local = localParts(input.now, input.timeZone);
  return local.weekday === input.weekday && local.hour >= input.hour;
}

export function fortuneWeeklyLocalSlot(now: Date, timeZone: string) {
  const local = localParts(now, timeZone);
  const monday = new Date(`${local.date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((local.weekday + 6) % 7));
  return { ...local, weekStart: monday.toISOString().slice(0, 10) };
}

export function fortuneWeeklyDeliveryKey(now: Date, timeZone: string) {
  return localParts(now, timeZone).date;
}

export const fortuneWeeklyLinePath = (serviceSlug: string) =>
  `/s/${encodeURIComponent(serviceSlug)}/today/from-line`;

export function buildFortuneWeeklyLineMessage(input: { serviceName: string; serviceUrl: string }) {
  return [
    `【${input.serviceName}】今週の占いのお知らせです。`,
    '今の気持ちに合うテーマを選んで、今週のヒントを確認できます。',
    input.serviceUrl,
    '',
    '占い結果や個人情報は、このLINE本文には表示しません。',
  ].join('\n');
}
