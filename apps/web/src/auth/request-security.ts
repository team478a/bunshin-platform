import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import {
  CUSTOM_DOMAIN_HOST_HEADER,
  normalizeRequestHostname,
} from '../services/custom-domain-routing';

export function trustedRequestOrigin(request: Request): string {
  const defaultOrigin = new URL(getServerEnvironment().APP_URL).origin;
  const customHostname = normalizeRequestHostname(request.headers.get(CUSTOM_DOMAIN_HOST_HEADER));
  const suppliedOrigin = request.headers.get('origin');
  if (!customHostname || !suppliedOrigin) return defaultOrigin;
  try {
    const origin = new URL(suppliedOrigin);
    if (origin.protocol === 'https:' && origin.hostname.toLowerCase() === customHostname)
      return origin.origin;
  } catch {
    return defaultOrigin;
  }
  return defaultOrigin;
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const expected = trustedRequestOrigin(request);
  if (origin !== expected) throw new ApplicationError('FORBIDDEN', 'Request origin is invalid');
}
