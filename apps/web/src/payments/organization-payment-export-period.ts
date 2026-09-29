import { ApplicationError } from '@bunshin/shared';

export const ORGANIZATION_PAYMENT_EXPORT_LIMIT = 10_000;

function invalidPeriod(): never {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid payment export period');
}

function japanMidnight(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalidPeriod();
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  // UTC setters avoid the special treatment of years 00–99 in Date.UTC.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (
    year < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return invalidPeriod();
  return new Date(date.getTime() - 9 * 60 * 60 * 1000);
}

export function organizationPaymentExportPeriod(params: URLSearchParams): {
  from: string | null;
  to: string | null;
  createdAt?: { gte: Date; lt: Date };
} {
  for (const key of params.keys()) {
    if (!['from', 'to'].includes(key) || params.getAll(key).length !== 1) invalidPeriod();
  }
  const from = params.get('from') || null;
  const to = params.get('to') || null;
  if (!from && !to) return { from: null, to: null };
  if (!from || !to) return invalidPeriod();
  const gte = japanMidnight(from);
  const end = japanMidnight(to);
  if (gte > end) return invalidPeriod();
  return { from, to, createdAt: { gte, lt: new Date(end.getTime() + 24 * 60 * 60 * 1000) } };
}
