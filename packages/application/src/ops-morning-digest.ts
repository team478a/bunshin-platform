import type { AdminAlertSeverity } from './admin-alert-center';

export const OPS_MORNING_DIGEST_UNIMPLEMENTED_ITEMS = [
  '投稿案生成',
  '品質チェック・自動修正',
  'トレンド調査',
  'LINE学習',
  '投稿停止・支援',
  '保存期間の自動削除',
  'サービス別AI予算比率・自動停止履歴',
  '週次改善Overview・支援候補',
] as const;

export type OpsMorningDigestErrorCategory =
  | 'DATABASE_READ_FAILED'
  | 'ALERT_CENTER_UNAVAILABLE'
  | 'INVALID_SOURCE_CONFIGURATION'
  | 'SOURCE_DATA_INCOMPLETE';

export type OpsMorningDigestCollectorResult<T> =
  | { status: 'OK'; value: T }
  | { status: 'UNAVAILABLE'; errorCategory: OpsMorningDigestErrorCategory }
  | { status: 'NOT_APPLICABLE'; reason: 'NO_SCHEDULED_FORTUNE_DELIVERY' };

export interface OpsMorningDigestDateWindow {
  targetDate: string;
  from: Date;
  to: Date;
}

export interface OpsMorningDigestAlert {
  code: string;
  severity: AdminAlertSeverity;
  title: string;
  count: number | null;
  href: string;
}

export type OpsMorningDigestBroadcastStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface OpsMorningDigestBroadcastCount {
  serviceName: string;
  status: OpsMorningDigestBroadcastStatus;
  count: number;
}

export type OpsMorningDigestInvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID';

export interface OpsMorningDigestInvoiceCount {
  status: OpsMorningDigestInvoiceStatus;
  count: number;
}

export type OpsMorningDigestPreviousDelivery = 'SENT' | 'NOT_SENT' | 'UNKNOWN';

export interface BuildOpsMorningDigestInput {
  targetDate: string;
  alerts: OpsMorningDigestCollectorResult<OpsMorningDigestAlert[]>;
  serviceBroadcasts: OpsMorningDigestCollectorResult<OpsMorningDigestBroadcastCount[]>;
  fortuneWeeklyBroadcasts: OpsMorningDigestCollectorResult<OpsMorningDigestBroadcastCount[]>;
  invoices: OpsMorningDigestCollectorResult<OpsMorningDigestInvoiceCount[]>;
  previousDelivery: OpsMorningDigestPreviousDelivery;
}

export interface OpsMorningDigestReport {
  targetDate: string;
  status: 'NO_ISSUES' | 'ATTENTION' | 'ANOMALY' | 'COLLECTION_FAILED' | 'DELIVERY_UNCONFIRMED';
  criticalCount: number;
  warningCount: number;
  subject: string;
  body: string;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

function tokyoDateParts(now: Date) {
  if (Number.isNaN(now.getTime())) throw new RangeError('invalid digest reference time');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  return { year, month, day };
}

/** Returns the previous JST calendar day as a half-open UTC range. */
export function opsMorningDigestDateWindow(now: Date): OpsMorningDigestDateWindow {
  const { year, month, day } = tokyoDateParts(now);
  const todayStartUtc = Date.UTC(year, month - 1, day) - JST_OFFSET_MS;
  const from = new Date(todayStartUtc - DAY_MS);
  const to = new Date(todayStartUtc);
  const targetDate = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  return { targetDate, from, to };
}

const count = (alerts: OpsMorningDigestAlert[], severity: AdminAlertSeverity) =>
  alerts.filter((alert) => alert.severity === severity).length;

const isUnavailable = (result: OpsMorningDigestCollectorResult<unknown>) =>
  result.status === 'UNAVAILABLE';

function collectorStatusLine<T>(
  label: string,
  result: OpsMorningDigestCollectorResult<T>,
  count: (value: T) => number,
) {
  if (result.status === 'UNAVAILABLE') return `${label}: 取得失敗（${result.errorCategory}）`;
  if (result.status === 'NOT_APPLICABLE') return `${label}: 本日対象外`;
  return `${label}: ${count(result.value)}件`;
}

function collectionStatusLines(input: BuildOpsMorningDigestInput): string[] {
  return [
    collectorStatusLine('運用通知センター', input.alerts, (value) => value.length),
    collectorStatusLine('LINE配信', input.serviceBroadcasts, (value) =>
      value.reduce((sum, row) => sum + row.count, 0),
    ),
    collectorStatusLine('占い週次LINE', input.fortuneWeeklyBroadcasts, (value) =>
      value.reduce((sum, row) => sum + row.count, 0),
    ),
    collectorStatusLine('OEM請求書', input.invoices, (value) =>
      value.reduce((sum, row) => sum + row.count, 0),
    ),
  ];
}

function formatAlert(alert: OpsMorningDigestAlert) {
  const quantity = alert.count === null ? '' : `（${alert.count}件）`;
  return `- ${alert.title}${quantity} ${alert.href}`;
}

function formatBroadcasts(rows: OpsMorningDigestBroadcastCount[]) {
  return rows.map((row) => `- LINE配信 ${row.serviceName} / ${row.status}: ${row.count}件`);
}

function formatInvoices(rows: OpsMorningDigestInvoiceCount[]) {
  const statuses: OpsMorningDigestInvoiceStatus[] = ['DRAFT', 'ISSUED', 'PAID', 'VOID'];
  const counts = new Map(rows.map((row) => [row.status, row.count]));
  return statuses.map((status) => `- OEM請求書 ${status}: ${counts.get(status) ?? 0}件`);
}

function formatShortDate(targetDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate);
  if (!match) throw new RangeError('invalid digest target date');
  return `${Number(match[2])}/${Number(match[3])}`;
}

export function buildOpsMorningDigest(input: BuildOpsMorningDigestInput): OpsMorningDigestReport {
  const date = formatShortDate(input.targetDate);
  const alerts = input.alerts.status === 'OK' ? input.alerts.value : [];
  const criticalCount = count(alerts, 'CRITICAL');
  const warningCount = count(alerts, 'WARNING');
  const infoAlerts = alerts.filter((alert) => alert.severity === 'INFO');
  const unavailableCount = [
    input.alerts,
    input.serviceBroadcasts,
    input.fortuneWeeklyBroadcasts,
    input.invoices,
  ].filter((result) => isUnavailable(result)).length;
  const noPreviousDelivery = input.previousDelivery !== 'SENT';
  const noIssues =
    criticalCount === 0 && warningCount === 0 && unavailableCount === 0 && !noPreviousDelivery;

  const status: OpsMorningDigestReport['status'] = noIssues
    ? 'NO_ISSUES'
    : criticalCount > 0
      ? 'ANOMALY'
      : warningCount > 0
        ? 'ATTENTION'
        : unavailableCount > 0
          ? 'COLLECTION_FAILED'
          : 'DELIVERY_UNCONFIRMED';
  const severitySummary = `異常${criticalCount}件・注意${warningCount}件`;
  const suffix = unavailableCount > 0 ? `・取得失敗${unavailableCount}項目` : '';
  const subjectSummary =
    noIssues || (criticalCount === 0 && warningCount === 0 && unavailableCount === 0)
      ? noPreviousDelivery
        ? input.previousDelivery === 'NOT_SENT'
          ? '前日まとめ未送信'
          : '前日まとめ送信状況未確認'
        : '異常なし'
      : `${severitySummary}${suffix}`;
  const subject = `【ワタシワークス運用】${date} ${subjectSummary}`;

  const unimplementedLine = `この版で未対応の項目：${OPS_MORNING_DIGEST_UNIMPLEMENTED_ITEMS.join('、')}（${OPS_MORNING_DIGEST_UNIMPLEMENTED_ITEMS.length}項目）`;
  const infoLine =
    infoAlerts.length > 0
      ? `INFO（参考）：${infoAlerts.map((alert) => `${alert.title} ${alert.href}`).join(' / ')}`
      : '';
  let body: string;
  if (noIssues) {
    const normalLine = `前日の定期処理・配信・通知はすべて正常でした。管理画面：/admin/alerts${infoLine ? `。${infoLine}` : ''}`;
    body = `${normalLine}\n${unimplementedLine}`;
  } else {
    const lines = [
      ...alerts.filter((alert) => alert.severity === 'CRITICAL').map(formatAlert),
      ...alerts.filter((alert) => alert.severity === 'WARNING').map(formatAlert),
      ...infoAlerts.map((alert) => `- INFO（参考）${formatAlert(alert).slice(2)}`),
      ...(input.serviceBroadcasts.status === 'OK'
        ? formatBroadcasts(input.serviceBroadcasts.value)
        : []),
      ...(input.fortuneWeeklyBroadcasts.status === 'OK'
        ? formatBroadcasts(input.fortuneWeeklyBroadcasts.value)
        : []),
      ...(input.invoices.status === 'OK' ? formatInvoices(input.invoices.value) : []),
      ...collectionStatusLines(input),
    ];
    if (input.previousDelivery === 'NOT_SENT') lines.push('- 前日のまとめ：未送信');
    if (input.previousDelivery === 'UNKNOWN') lines.push('- 前日のまとめ：送信状況未確認');
    body = [...lines, unimplementedLine].join('\n');
  }

  return { targetDate: input.targetDate, status, criticalCount, warningCount, subject, body };
}
