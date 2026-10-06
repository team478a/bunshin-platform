import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';
import {
  personalLearningPreparationAccess,
  recheckPersonalLearningPreparationAccess,
} from '../services/personal-learning-preparation-access';
const common = {
  operationId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  confirmation: z.literal('CONFIRM_PILOT_PARTICIPANT_OPERATION'),
  reviewEvidenceKey: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/),
};
const schema = z.discriminatedUnion('action', [
  z
    .object({
      ...common,
      action: z.literal('CONFIGURE'),
      externalParticipantCap: z.number().int().min(0).max(100),
      internalParticipantCap: z.number().int().min(0).max(100),
      currentWave: z.number().int().min(0).max(4),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal('ADMIT'),
      programEnrollmentId: z.uuid(),
      kind: z.enum(['INTERNAL', 'EXTERNAL']),
    })
    .strict(),
  z.object({ ...common, action: z.literal('REVOKE'), programEnrollmentId: z.uuid() }).strict(),
]);
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
export async function personalLearningParticipantAdminResponse(
  request: Request,
  serviceSlug: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    if (!['GET', 'POST'].includes(request.method))
      return Response.json(
        { requestId },
        { status: 405, headers: { ...headers, allow: 'GET, POST' } },
      );
    if (request.method === 'POST') requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const flag = 'PERSONAL_LEARNING_PARTICIPANT_PREPARATION';
    const authority = personalLearningPreparationAccess(flag);
    if (!authority) throw new ApplicationError('NOT_FOUND', 'pilot preparation unavailable');
    if (new URL(request.url).search)
      throw new ApplicationError('VALIDATION_ERROR', 'query not accepted');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    if (authority.workspaceId !== service.workspaceId || authority.groupId !== service.serviceId)
      throw new ApplicationError('NOT_FOUND', 'pilot preparation unavailable');
    const db = await import('@bunshin/database');
    recheckPersonalLearningPreparationAccess(flag, authority);
    const repo = new db.PrismaPersonalLearningParticipantAdminRepository(db.prisma, authority);
    if (request.method === 'GET')
      return Response.json({ data: await repo.read(actor.userId), requestId }, { headers });
    if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body)
      throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 2048) {
          await reader.cancel();
          return Response.json({ requestId }, { status: 413, headers });
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    let json: unknown;
    try {
      json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'valid JSON required');
    }
    const command = schema.safeParse(json);
    if (!command.success)
      throw new ApplicationError('VALIDATION_ERROR', 'valid reviewed operation required');
    recheckPersonalLearningPreparationAccess(flag, authority);
    return Response.json(
      { data: await repo.change(actor.userId, command.data), requestId },
      { headers },
    );
  } catch (error) {
    if (
      error instanceof ApplicationError &&
      ['PILOT_CAP_REACHED', 'WAVE_CAP_REACHED'].includes(error.message)
    )
      return Response.json(
        {
          error: { code: error.message, message: '現在、無料モニターの受付上限に達しています。' },
          requestId,
        },
        { status: 409, headers },
      );
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
