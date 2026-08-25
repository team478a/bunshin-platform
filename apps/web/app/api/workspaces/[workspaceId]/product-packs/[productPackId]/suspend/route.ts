import { ProductPackService } from '@bunshin/application';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../../src/auth/current-user';
import { requireSameOrigin } from '../../../../../../../src/auth/request-security';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; productPackId: string }> },
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const { workspaceId, productPackId } = await params;
    const db = await import('@bunshin/database');
    const data = await new ProductPackService(new db.PrismaProductPackRepository()).suspend({
      workspaceId: z.string().uuid().parse(workspaceId),
      productPackId: z.string().uuid().parse(productPackId),
      actorUserId: user.userId,
    });
    return Response.json({ data, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}
