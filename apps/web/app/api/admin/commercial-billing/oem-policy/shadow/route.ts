import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { currentUserProvider } from '../../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get('workspaceId'));
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(url.searchParams.get('month'));
    const db = await import('@bunshin/database');
    const result = await new db.PrismaOemBillingAdminService().shadow({
      workspaceId,
      actorUserId: actor.userId,
      month: new Date(`${month}-01T00:00:00Z`),
    });
    return Response.json({ data: result }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
