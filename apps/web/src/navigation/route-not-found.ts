import { ApplicationError } from '@bunshin/shared';

export function isRouteNotFound(error: unknown): boolean {
  return (
    error instanceof ApplicationError && (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN')
  );
}
