import 'server-only';
import { z } from 'zod';
import {
  personalLearningPreparationAccess,
  recheckPersonalLearningPreparationAccess,
} from '../services/personal-learning-preparation-access';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';
const command = z
  .object({
    operationId: z.uuid(),
    role: z.enum(['SALES', 'OFFICE', 'MANAGER', 'OTHER']),
    aiLevel: z.enum(['BEGINNER', 'INTERMEDIATE']),
    dailyMinutes: z.union([z.literal(5), z.literal(10), z.literal(15)]),
    confirmation: z.literal('CONFIRM_MY_LEARNING_PROFILE'),
    expectedAbsent: z.literal(true),
  })
  .strict();
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
export async function personalLearningPilotProfileResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
): Promise<Response> {
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
    const authority = personalLearningPreparationAccess('PERSONAL_LEARNING_PROFILE_PREPARATION');
    if (new URL(request.url).search)
      throw new ApplicationError('VALIDATION_ERROR', 'query scope not accepted');
    const enrollment = z.uuid().safeParse(rawEnrollmentId);
    if (!enrollment.success)
      throw new ApplicationError('VALIDATION_ERROR', 'valid enrollment required');
    const service = await resolveMemberServiceContext(serviceSlug, actor.userId).catch((error) => {
      if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND')
        throw new ApplicationError('NOT_FOUND', 'service unavailable');
      throw error;
    });
    const scope = {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      programEnrollmentId: enrollment.data,
      actorUserId: actor.userId,
    };
    if (
      authority &&
      (authority.workspaceId !== scope.workspaceId || authority.groupId !== scope.groupId)
    )
      throw new ApplicationError('NOT_FOUND', 'learning preparation unavailable');
    const db = await import('@bunshin/database');
    recheckPersonalLearningPreparationAccess('PERSONAL_LEARNING_PROFILE_PREPARATION', authority);
    const repository = new db.PrismaPersonalLearningPilotProfileRepository(
      db.prisma,
      undefined,
      authority,
    );
    if (request.method === 'GET')
      return Response.json({ data: await repository.read(scope), requestId }, { headers });
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
    const parsed = command.safeParse(json);
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'explicit profile confirmation required');
    recheckPersonalLearningPreparationAccess('PERSONAL_LEARNING_PROFILE_PREPARATION', authority);
    return Response.json(
      { data: await repository.initialize(scope, parsed.data), requestId },
      { headers },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
