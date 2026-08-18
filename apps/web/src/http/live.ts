import { requestIdFromHeader } from '@bunshin/observability';

export function liveResponse(request: Request): Response {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  return Response.json({ status: 'ok', service: 'web', requestId });
}
