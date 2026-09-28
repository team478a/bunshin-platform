import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { authorizeCronRequest } from './cron-security';

const scopeSchema = z.object({ workspaceId: z.uuid(), groupId: z.uuid() }).strict();
const headers = { 'cache-control': 'private, no-store' };

export async function trainingRetentionPreviewResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    authorizeCronRequest(request, getServerEnvironment().CRON_SECRET);
    if (request.method !== 'POST')
      return Response.json({ requestId }, { status: 405, headers: { ...headers, allow: 'POST' } });
    if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body) {
      return Response.json({ requestId }, { status: 400, headers });
    }
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 512) {
          await reader.cancel();
          return Response.json({ requestId }, { status: 413, headers });
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = Buffer.concat(chunks).toString('utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return Response.json({ requestId }, { status: 400, headers });
    }
    const scope = scopeSchema.safeParse(parsed);
    if (!scope.success) return Response.json({ requestId }, { status: 400, headers });
    const { PrismaTrainingRetentionPreviewRepository } = await import('@bunshin/database');
    const result = await new PrismaTrainingRetentionPreviewRepository().preview({
      ...scope.data,
      now: new Date(),
    });
    return Response.json(
      { ...result, requestId },
      { status: result.outcome === 'TOO_LARGE' ? 413 : 200, headers },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
