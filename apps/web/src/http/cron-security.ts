import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import { createHash, timingSafeEqual } from 'node:crypto';

const sameSecret = (presented: string, expected: string) => {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(presented), digest(expected));
};

export function authorizeCronRequest(request: Request, secret: string | undefined) {
  if (!secret) throw new ApplicationError('CONFIGURATION_ERROR', 'CRON_SECRET is required');
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer '))
    throw new ApplicationError('UNAUTHENTICATED', 'cron authorization required');
  if (!sameSecret(authorization.slice('Bearer '.length), secret))
    throw new ApplicationError('UNAUTHENTICATED', 'cron authorization required');
}
