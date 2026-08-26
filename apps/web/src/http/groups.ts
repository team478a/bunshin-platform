import 'server-only';
import { GroupParticipationService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuid = z.string().uuid();
const createSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();

export async function createGroupResponse(request: Request, workspaceId: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = createSchema.parse(await request.json());
    const db = await import('@bunshin/database');
    const group = await new GroupParticipationService(
      new db.PrismaGroupParticipationRepository(),
    ).createGroup({
      workspaceId: uuid.parse(workspaceId),
      actorUserId: user.userId,
      name: value.name,
    });
    return Response.json(
      { data: group, requestId },
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
