import 'server-only';
import { ExternalReadError } from '@bunshin/application';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { createExternalReadServices } from '../services/external-read';

const headers = { 'cache-control': 'private, no-store', vary: 'Authorization' };
const logger = createLogger();
/** Never consult cookies or provision a member. All target scope comes from the bound grant. */
export async function externalReadResponse(
  request: Request,
  connectionId: string,
  operation: 'usage' | 'bind',
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  let status = 500;
  let errorCode: string | undefined;
  try {
    const method = operation === 'usage' ? 'GET' : 'POST';
    if (request.method !== method) {
      status = 405;
      return Response.json(
        { error: { code: 'METHOD_NOT_ALLOWED', requestId } },
        { status, headers: { ...headers, allow: method } },
      );
    }
    // Path-only contract: no caller-supplied principal, user, service, filters or operation.
    if (
      !z.uuid().safeParse(connectionId).success ||
      new URL(request.url).searchParams.size ||
      request.body !== null
    )
      throw new ApplicationError('VALIDATION_ERROR', 'path-only request required');
    const services = await createExternalReadServices();
    if (!services) throw new ApplicationError('NOT_FOUND', 'external reads unavailable');
    const authorization = request.headers.get('authorization');
    if (!authorization || !/^Bearer /i.test(authorization))
      throw new ApplicationError('UNAUTHENTICATED', 'bearer required');
    if (operation === 'bind') {
      await services.binding.execute(authorization, connectionId);
      status = 200;
      return Response.json({ data: { saved: true }, requestId }, { headers });
    }
    const data = await services.usage.execute(authorization, { connectionId, requestId });
    status = 200;
    return Response.json({ data, requestId }, { headers });
  } catch (error) {
    if (error instanceof ExternalReadError) {
      errorCode = error.code;
      status = { DENIED: 403, INVALID: 400, LIMITED: 429, TIMEOUT: 504, UNAVAILABLE: 503 }[
        error.code
      ];
      return Response.json(
        {
          error: { code: error.code, message: '外部接続の処理を完了できませんでした。', requestId },
        },
        { status, headers },
      );
    }
    const mapped = toApiError(error, requestId);
    status = mapped.status;
    errorCode = mapped.body.error.code;
    return Response.json(mapped.body, { status, headers });
  } finally {
    // Existing operational log only; never record credentials, target scope or response data.
    try {
      logger.info('external read request', {
        requestId,
        operation,
        status,
        latency: Date.now() - started,
        ...(errorCode ? { errorCode } : {}),
      });
    } catch {
      console.warn('external read operational log unavailable');
    }
  }
}
