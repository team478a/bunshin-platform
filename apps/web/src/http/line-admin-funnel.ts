import 'server-only';
import { GetLineAdminFunnel, type LineAdminFunnelSnapshot } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { currentLineEnvironment } from '../line/secure-configuration';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const query = z.object({ from: date, to: date }).strict();

export const lineFunnelDto = (value: LineAdminFunnelSnapshot) => ({
  ...value,
  period: { from: value.period.from.toISOString(), to: value.period.to.toISOString() },
});

export async function lineAdminFunnelResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid query');
    const from = new Date(`${parsed.data.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.data.to}T00:00:00.000Z`);
    const db = await import('@bunshin/database');
    const value = await new GetLineAdminFunnel(new db.PrismaLineAdminFunnelRepository()).execute({
      actorUserId: user.userId,
      environment: currentLineEnvironment(),
      from,
      to,
    });
    return Response.json(
      { data: lineFunnelDto(value), requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
