import 'server-only';
import { RequestVideoSceneGenerationRetry } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { currentLineEnvironment } from '../line/secure-configuration';

const bodySchema = z.object({ reason: z.string().min(3).max(500) }).strict();

export async function retryVideoSceneGenerationResponse(request: Request, generationId: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
    }
    const input = bodySchema.parse(body);
    const db = await import('@bunshin/database');
    const value = await new RequestVideoSceneGenerationRetry(
      new db.PrismaVideoRenderOperationsRepository(),
    ).execute({
      requestId: randomUUID(),
      actorUserId: actor.userId,
      environment: currentLineEnvironment(),
      generationId,
      reason: input.reason,
    });
    return Response.json(
      { data: { id: value.id, jobId: value.jobId }, requestId },
      { status: 201, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
