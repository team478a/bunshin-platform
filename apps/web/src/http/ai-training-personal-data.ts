import 'server-only';
import { ExportTrainingPersonalData } from '@bunshin/capability-training';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

export async function exportAiTrainingPersonalDataResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
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
    const body: unknown = await request.json().catch(() => {
      throw new ApplicationError('VALIDATION_ERROR', 'valid JSON required');
    });
    if (!z.object({}).strict().safeParse(body).success)
      throw new ApplicationError('VALIDATION_ERROR', 'empty export request required');
    const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const result = await new ExportTrainingPersonalData(
      new db.PrismaTrainingPersonalDataExportRepository(db.prisma),
    ).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      programEnrollmentId: id.data,
      now: new Date(),
    });
    if (result.outcome === 'TOO_LARGE')
      return Response.json(
        {
          error: {
            code: 'EXPORT_TOO_LARGE',
            message: 'データ量が多いため、一括保存できません。運営者へお問い合わせください。',
            requestId,
          },
        },
        { status: 413, headers },
      );
    if (result.outcome !== 'EXPORTED')
      throw new ApplicationError('NOT_FOUND', 'training enrollment unavailable');
    return new Response(result.json, {
      headers: {
        ...headers,
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${result.filename}"`,
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
