export const COMMERCIAL_USAGE_EVENT_TYPES = [
  'POST_VIEW',
  'POST_GENERATE',
  'POST_REGENERATE',
  'DAILY_MISSION_VIEW',
  'WEEKLY_PLAN_VIEW',
  'CONTENT_APPROVE',
] as const;

export type CommercialUsageEventType = (typeof COMMERCIAL_USAGE_EVENT_TYPES)[number];

export const OEM_MAU_PRICING_VERSION = 'oem-mau-jpy-v1';
export const OEM_MAU_TIME_ZONE = 'Asia/Tokyo';

export interface MauPricingTier {
  tierKey: string;
  upperLimit: number;
  priceYen: number;
}

export interface MauPricingQuote {
  pricingVersion: string;
  tierKey: string;
  mau: number;
  priceYen: number | null;
  upperLimit: number | null;
  remainingToNextTier: number | null;
  customQuoteRequired: boolean;
}

const PRICING_TIERS = [
  { tierKey: 'MAU_0_100', upperLimit: 100, priceYen: 19_800 },
  { tierKey: 'MAU_101_300', upperLimit: 300, priceYen: 39_800 },
  { tierKey: 'MAU_301_500', upperLimit: 500, priceYen: 59_800 },
  { tierKey: 'MAU_501_1000', upperLimit: 1_000, priceYen: 99_800 },
  { tierKey: 'MAU_1001_3000', upperLimit: 3_000, priceYen: 198_000 },
] as const;

export function quoteOemMauPrice(mau: number): MauPricingQuote {
  return quoteMauPrice(mau, OEM_MAU_PRICING_VERSION, PRICING_TIERS);
}

export function quoteMauPrice(
  mau: number,
  pricingVersion: string,
  tiers: readonly MauPricingTier[],
): MauPricingQuote {
  if (!Number.isInteger(mau) || mau < 0) throw new Error('MAU must be a non-negative integer');
  if (!pricingVersion.trim() || tiers.length === 0) throw new Error('invalid pricing schedule');
  let previousLimit = 0;
  for (const tier of tiers) {
    if (
      !tier.tierKey.trim() ||
      !Number.isInteger(tier.upperLimit) ||
      tier.upperLimit <= previousLimit ||
      !Number.isInteger(tier.priceYen) ||
      tier.priceYen < 0
    )
      throw new Error('invalid pricing tier');
    previousLimit = tier.upperLimit;
  }
  const tier = tiers.find((candidate) => mau <= candidate.upperLimit);
  if (!tier) {
    return {
      pricingVersion,
      tierKey: 'CUSTOM',
      mau,
      priceYen: null,
      upperLimit: null,
      remainingToNextTier: null,
      customQuoteRequired: true,
    };
  }
  return {
    pricingVersion,
    tierKey: tier.tierKey,
    mau,
    priceYen: tier.priceYen,
    upperLimit: tier.upperLimit,
    remainingToNextTier: Math.max(0, tier.upperLimit - mau),
    customQuoteRequired: false,
  };
}

export interface CommercialMonthPeriod {
  key: string;
  start: Date;
  end: Date;
  timeZone: typeof OEM_MAU_TIME_ZONE;
}

/** Asia/Tokyoの暦月を、DB検索に使う半開区間 [start, end) へ変換する。 */
export function commercialMonthPeriod(now: Date, monthOffset = 0): CommercialMonthPeriod {
  if (Number.isNaN(now.getTime()) || !Number.isInteger(monthOffset))
    throw new Error('invalid month');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OEM_MAU_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find(({ type }) => type === 'year')?.value);
  const month = Number(parts.find(({ type }) => type === 'month')?.value);
  const target = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth();
  const tokyoOffsetMs = 9 * 60 * 60 * 1_000;
  const start = new Date(Date.UTC(targetYear, targetMonth, 1) - tokyoOffsetMs);
  const end = new Date(Date.UTC(targetYear, targetMonth + 1, 1) - tokyoOffsetMs);
  return {
    key: `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`,
    start,
    end,
    timeZone: OEM_MAU_TIME_ZONE,
  };
}
