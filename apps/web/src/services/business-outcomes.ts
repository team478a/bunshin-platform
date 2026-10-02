export const BUSINESS_OUTCOME_KEYS = [
  'inquiries',
  'reservations',
  'visits',
  'repeatReservations',
  'repeatVisits',
  'orders',
  'other',
] as const;

export type BusinessOutcomeKey = (typeof BUSINESS_OUTCOME_KEYS)[number];
export type BusinessOutcomes = Record<BusinessOutcomeKey, number>;
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function jsonObject(value: unknown): { [key: string]: JsonValue } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) {
      result[key] = item as string | number | boolean | null;
    } else if (Array.isArray(item)) {
      result[key] = item.filter(
        (entry): entry is string | number | boolean | null =>
          entry === null || ['string', 'number', 'boolean'].includes(typeof entry),
      );
    } else if (typeof item === 'object') {
      result[key] = jsonObject(item);
    }
  }
  return result;
}

export const emptyBusinessOutcomes = (): BusinessOutcomes => ({
  inquiries: 0,
  reservations: 0,
  visits: 0,
  repeatReservations: 0,
  repeatVisits: 0,
  orders: 0,
  other: 0,
});

const boundedCount = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999 ? value : 0;

export function readBusinessOutcomes(value: unknown): BusinessOutcomes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyBusinessOutcomes();
  const metrics = value as Record<string, unknown>;
  const nested = metrics['businessOutcomes'];
  if (!nested || typeof nested !== 'object' || Array.isArray(nested))
    return emptyBusinessOutcomes();
  const record = nested as Record<string, unknown>;
  return {
    inquiries: boundedCount(record['inquiries']),
    reservations: boundedCount(record['reservations']),
    visits: boundedCount(record['visits']),
    repeatReservations: boundedCount(record['repeatReservations']),
    repeatVisits: boundedCount(record['repeatVisits']),
    orders: boundedCount(record['orders']),
    other: boundedCount(record['other']),
  };
}

export function writeBusinessOutcomes(
  current: unknown,
  outcomes: BusinessOutcomes,
): { [key: string]: JsonValue } {
  const existing = jsonObject(current);
  return { ...existing, businessOutcomes: outcomes };
}

export function sumBusinessOutcomes(values: unknown[]): BusinessOutcomes {
  return values.reduce<BusinessOutcomes>((total, value) => {
    const item = readBusinessOutcomes(value);
    for (const key of BUSINESS_OUTCOME_KEYS) total[key] += item[key];
    return total;
  }, emptyBusinessOutcomes());
}
