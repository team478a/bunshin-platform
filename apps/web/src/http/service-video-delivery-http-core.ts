import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { z } from 'zod';

export const serviceVideoDeliveryUuid = z.string().uuid();

export const serviceVideoDeliveryRequestId = (request: Request) =>
  requestIdFromHeader(request.headers.get('x-request-id'));

export function serviceVideoDeliveryJsonError(error: unknown, requestId: string) {
  const mapped = toApiError(error, requestId);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
}
