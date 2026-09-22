import { ApplicationError } from '@bunshin/shared';

export const isOneOf = <T extends string>(value: string, values: readonly T[]): value is T =>
  values.some((candidate) => candidate === value);

export function nullableText(value: string | null, maximum: number): string | null;
export function nullableText(value: undefined, maximum: number): undefined;
export function nullableText(
  value: string | null | undefined,
  maximum: number,
): string | null | undefined;
export function nullableText(value: string | null | undefined, maximum: number) {
  if (value === undefined) return undefined;
  if (value === null || value.trim().length === 0) return null;
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new ApplicationError('VALIDATION_ERROR', 'text exceeds maximum length');
  }
  return normalized;
}

export function validateEnum<T extends string>(
  value: string,
  values: readonly T[],
  field: string,
): T {
  if (!isOneOf(value, values)) {
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  }
  return value;
}
