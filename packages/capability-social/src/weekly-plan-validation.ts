import { ApplicationError } from '@bunshin/shared';

import { SOCIAL_PREFERRED_FORMATS, type SocialPreferredFormat } from './social-profile';
import { validateEnum } from './social-validation';

export function localDate(value: string, monday = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid local date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value ||
    (monday && date.getUTCDay() !== 1)
  )
    throw new ApplicationError(
      'VALIDATION_ERROR',
      monday ? 'week must start on Monday' : 'invalid local date',
    );
  return value;
}

export function timezone(value: string) {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 64)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid timezone');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid timezone', error);
  }
  return normalized;
}

export function weeklyText(value: string, maximum: number, field: string) {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
}

export function weeklyNullable(value: string | null, maximum: number): string | null;
export function weeklyNullable(value: undefined, maximum: number): undefined;
export function weeklyNullable(
  value: string | null | undefined,
  maximum: number,
): string | null | undefined;
export function weeklyNullable(value: string | null | undefined, maximum: number) {
  if (value === undefined) return undefined;
  if (value === null || value.trim().length === 0) return null;
  return weeklyText(value, maximum, 'text');
}

export function weeklyFormat(value: SocialPreferredFormat) {
  return validateEnum(value, SOCIAL_PREFERRED_FORMATS, 'recommendedFormat');
}
