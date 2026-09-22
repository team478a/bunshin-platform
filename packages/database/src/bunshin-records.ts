import { ApplicationError } from '@bunshin/shared';
import type { Prisma } from './client';

export function stringArray(value: Prisma.JsonValue, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new ApplicationError('DATABASE_UNAVAILABLE', `${field} contains invalid persisted data`);
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new ApplicationError(
        'DATABASE_UNAVAILABLE',
        `${field} contains invalid persisted data`,
      );
    }
    result.push(item);
  }
  return result;
}
