import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';
import { executeFeedbackReview } from '../services/improvement-feedback-review';

const handle = z.string().regex(/^[A-Za-z0-9_-]{64,3000}$/);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('PREPARE'), handle }).strict(),
  z
    .object({
      action: z.literal('MARK_REVIEWED'),
      handle,
      reasonCode: z.literal('REVIEW_COMPLETED'),
      confirmation: z.literal('RECORD_REVIEW'),
    })
    .strict(),
  z
    .object({
      action: z.literal('DISMISS'),
      handle,
      reasonCode: z.enum(['OUT_OF_SCOPE', 'DUPLICATE_REVIEW']),
      confirmation: z.literal('RECORD_REVIEW'),
    })
    .strict(),
]);
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
export async function feedbackReviewResponse(request: Request, slug: string): Promise<Response> {
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (
      request.method !== 'POST' ||
      !request.body ||
      request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json'
    )
      throw new ApplicationError('VALIDATION_ERROR', 'JSON POST required');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 4096) {
          await reader.cancel();
          throw new ApplicationError('VALIDATION_ERROR', 'request too large');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON');
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid review request');
    const service = await resolveManagedServiceContext(slug, actor.userId, 'ADMINISTRATION').catch(
      (error: unknown) => {
        if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND')
          throw new ApplicationError('NOT_FOUND', 'managed service unavailable');
        throw error;
      },
    );
    if (!['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(service.serviceRole))
      throw new ApplicationError('NOT_FOUND', 'managed service unavailable');
    const data = await executeFeedbackReview({
      workspaceId: service.workspaceId,
      serviceId: service.serviceId,
      actorUserId: actor.userId,
      command: parsed.data,
    });
    return Response.json({ data }, { headers });
  } catch (error) {
    const mapped = toApiError(error, 'feedback-review');
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
