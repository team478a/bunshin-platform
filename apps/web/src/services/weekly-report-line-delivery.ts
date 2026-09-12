export const WEEKLY_REPORT_DELIVERY_WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type WeeklyReportDeliveryWeekday = (typeof WEEKLY_REPORT_DELIVERY_WEEKDAYS)[number];

export type WeeklyReportDeliverySetting = {
  enabled: boolean;
  weekday: WeeklyReportDeliveryWeekday;
  localTime: string;
};

export const DEFAULT_WEEKLY_REPORT_DELIVERY_SETTING: WeeklyReportDeliverySetting = {
  enabled: false,
  weekday: 'MONDAY',
  localTime: '09:00',
};

const weekdayByShortName: Record<string, WeeklyReportDeliveryWeekday> = {
  Mon: 'MONDAY',
  Tue: 'TUESDAY',
  Wed: 'WEDNESDAY',
  Thu: 'THURSDAY',
  Fri: 'FRIDAY',
  Sat: 'SATURDAY',
  Sun: 'SUNDAY',
};

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function readWeeklyReportDeliverySetting(
  onboardingConfig: unknown,
): WeeklyReportDeliverySetting {
  const value = record(record(onboardingConfig)['weeklyReportDelivery']);
  const weekday = WEEKLY_REPORT_DELIVERY_WEEKDAYS.includes(
    value['weekday'] as WeeklyReportDeliveryWeekday,
  )
    ? (value['weekday'] as WeeklyReportDeliveryWeekday)
    : DEFAULT_WEEKLY_REPORT_DELIVERY_SETTING.weekday;
  const localTime =
    typeof value['localTime'] === 'string' && /^(0[7-9]|1\d|20):[0-5]\d$/.test(value['localTime'])
      ? value['localTime']
      : DEFAULT_WEEKLY_REPORT_DELIVERY_SETTING.localTime;
  return { enabled: value['enabled'] === true, weekday, localTime };
}

export function writeWeeklyReportDeliverySetting(
  onboardingConfig: unknown,
  setting: WeeklyReportDeliverySetting,
) {
  return { ...record(onboardingConfig), weeklyReportDelivery: setting };
}

export function weeklyReportDeliveryClock(now: Date, timezone = 'Asia/Tokyo') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values['year']}-${values['month']}-${values['day']}`,
    time: `${values['hour']}:${values['minute']}`,
    weekday: weekdayByShortName[values['weekday'] ?? ''] ?? 'MONDAY',
  };
}

export function isWeeklyReportDeliveryDue(input: {
  setting: WeeklyReportDeliverySetting;
  now: Date;
  timezone?: string;
}) {
  const clock = weeklyReportDeliveryClock(input.now, input.timezone);
  return (
    input.setting.enabled &&
    clock.weekday === input.setting.weekday &&
    clock.time >= input.setting.localTime
  );
}

export function buildWeeklyReportLineMessage(input: {
  serviceName: string;
  headline: string;
  nextStep: string;
  reportUrl: string;
}) {
  return `${input.serviceName}の1週間のふり返りです。\n\n${input.headline}\n\n次にやること\n${input.nextStep}\n\n今週できたことを見る\n${input.reportUrl}`;
}
