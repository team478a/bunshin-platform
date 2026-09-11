import { GetPointUserDashboard } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const { workspaceId } = await params;
    const db = await import('@bunshin/database');
    const parsedWorkspaceId = z.string().uuid().parse(workspaceId);
    if (
      !(await db.hasActiveRewardsPilotAccess(db.prisma, {
        workspaceId: parsedWorkspaceId,
        userId: user.userId,
      }))
    )
      throw new ApplicationError('FORBIDDEN', 'rewards pilot access required');
    const data = await new GetPointUserDashboard(new db.PrismaPointLedgerRepository()).execute({
      workspaceId: parsedWorkspaceId,
      actorUserId: user.userId,
      timezone: 'Asia/Tokyo',
    });
    return Response.json({ data, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}
