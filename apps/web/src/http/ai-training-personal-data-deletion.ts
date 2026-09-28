import 'server-only';
import { DeleteTrainingPersonalData } from '@bunshin/capability-training';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';

const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ALL') }).strict(),
  z.object({ kind: z.literal('ANSWER'), answerId: z.string().uuid() }).strict(),
]);
const previewSchema = z.object({ target }).strict();
const deleteSchema = z
  .object({
    target,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    confirmation: z.literal('DELETE_TRAINING_DATA'),
  })
  .strict();
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

export async function trainingPersonalDataDeletionResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
  action: 'preview' | 'delete',
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const id = z.string().uuid().safeParse(rawEnrollmentId);
    if (!id.success) throw new ApplicationError('VALIDATION_ERROR', 'valid enrollment required');
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const json: unknown = await request.json().catch(() => {
      throw new ApplicationError('VALIDATION_ERROR', 'valid JSON required');
    });
    const body = (action === 'preview' ? previewSchema : deleteSchema).safeParse(json);
    if (!body.success)
      throw new ApplicationError('VALIDATION_ERROR', 'valid deletion request required');
    const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const useCase = new DeleteTrainingPersonalData(
      new db.PrismaTrainingPersonalDataDeletionRepository(db.prisma),
    );
    const scope = {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId: id.data,
      target: body.data.target,
    };
    const result =
      action === 'preview'
        ? await useCase.preview(scope)
        : await useCase.execute({
            ...scope,
            revision: deleteSchema.parse(body.data).revision,
            now: new Date(),
          });
    if (result.outcome === 'NOT_FOUND')
      throw new ApplicationError('NOT_FOUND', 'training data unavailable');
    if (result.outcome === 'CONFLICT')
      throw new ApplicationError('CONFLICT', 'deletion preview changed');
    if (result.outcome === 'TOO_LARGE')
      return Response.json(
        {
          error: {
            code: 'DELETION_TOO_LARGE',
            message: 'データ量が多いため、一括削除できません。運営者へお問い合わせください。',
            requestId,
          },
        },
        { status: 413, headers },
      );
    return Response.json({ data: result, requestId }, { headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
