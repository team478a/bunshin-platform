import type { PointAccountSnapshot, PointTransactionRecord } from '@bunshin/application';
import type { Prisma } from './client';

export const pointAccountRecord = (
  row: Prisma.PointAccountGetPayload<object>,
): PointAccountSnapshot => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  availablePoints: row.availablePoints,
  recoveryDue: row.recoveryDue,
  updatedAt: row.updatedAt,
});

export const pointTransactionRecord = (
  row: Prisma.PointTransactionGetPayload<object>,
): PointTransactionRecord => ({
  id: row.id,
  accountId: row.accountId,
  workspaceId: row.workspaceId,
  userId: row.userId,
  groupId: row.groupId,
  campaignId: row.campaignId,
  type: row.type,
  amount: row.amount,
  idempotencyKey: row.idempotencyKey,
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  ruleVersionId: row.ruleVersionId,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
});

const pointDateParts = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
};

export const pointDayKey = (value: Date, timezone: string) => {
  const { year, month, day } = pointDateParts(value, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const pointWeekKey = (value: Date, timezone: string) => {
  const { year, month, day } = pointDateParts(value, timezone);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return pointDayKey(date, 'UTC');
};
