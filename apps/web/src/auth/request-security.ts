import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const expected = new URL(getServerEnvironment().APP_URL).origin;
  if (origin !== expected) throw new ApplicationError('FORBIDDEN', 'Request origin is invalid');
}
