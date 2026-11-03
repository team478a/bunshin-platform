import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { requireSameOrigin } from '../../../../src/auth/request-security';
import { decideOAuthConsent } from '../../../../src/services/oauth-consent';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' };
export async function POST(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  let authorizationId: string | null = null;
  try {
    requireSameOrigin(request);
    if (
      new URL(request.url).search ||
      request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded'
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid form');
    const form = await request.formData();
    const id = form.get('authorization_id'),
      decision = form.get('decision');
    if (
      typeof id !== 'string' ||
      (decision !== 'approve' && decision !== 'deny') ||
      form.getAll('authorization_id').length !== 1 ||
      form.getAll('decision').length !== 1 ||
      [...form.keys()].some((key) => !['authorization_id', 'decision'].includes(key))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid decision');
    if (/^[A-Za-z0-9_-]{1,128}$/.test(id)) authorizationId = id;
    const result = await decideOAuthConsent(id, decision);
    const location =
      result.kind === 'redirect'
        ? result.url
        : `/login?returnTo=${encodeURIComponent(result.returnTo)}`;
    return new Response(null, { status: 303, headers: { ...headers, location } });
  } catch (error) {
    if (request.headers.get('accept')?.includes('text/html')) {
      const location = `/oauth/consent?${authorizationId ? `authorization_id=${encodeURIComponent(authorizationId)}&` : ''}error=1`;
      return new Response(null, { status: 303, headers: { ...headers, location } });
    }
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
