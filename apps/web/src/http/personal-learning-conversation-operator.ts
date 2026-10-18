import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { resolveManagedServiceContext } from '../services/public-service';
import { PrismaPersonalLearningConversationRepository, prisma } from '@bunshin/database';

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

export async function personalLearningConversationOperatorResponse(
  request: Request,
  serviceSlug: string,
  requestId: string,
) {
  try {
    if (request.method !== 'GET')
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers });
    if (new URL(request.url).search)
      throw new ApplicationError('VALIDATION_ERROR', 'query parameters are not accepted');
    const id = z.string().uuid().safeParse(requestId);
    if (!id.success) throw new ApplicationError('NOT_FOUND', 'conversation unavailable');
    const operator = await (await currentUserProvider()).getCurrentUser();
    if (!operator) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, operator.userId);
    if (!['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(service.serviceRole))
      throw new ApplicationError('NOT_FOUND', 'conversation unavailable');
    const enrollment = await prisma.programEnrollment.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        personalLearningRequests: { some: { id: id.data } },
      },
      select: { id: true },
    });
    if (!enrollment) throw new ApplicationError('NOT_FOUND', 'conversation unavailable');
    const data = await new PrismaPersonalLearningConversationRepository(
      prisma,
    ).readSharedConversationForOperator({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      programEnrollmentId: enrollment.id,
      requestId: id.data,
      operatorUserId: operator.userId,
    });
    if (!data) throw new ApplicationError('NOT_FOUND', 'conversation unavailable');
    return Response.json({ data }, { headers });
  } catch (error) {
    const mapped = toApiError(error, 'learning-conversation-operator');
    return Response.json(
      {
        error: {
          code: mapped.body.error.code,
          message: '共有された会話を表示できません。共有が取り消されたか、権限がありません。',
        },
      },
      { status: mapped.status, headers },
    );
  }
}
