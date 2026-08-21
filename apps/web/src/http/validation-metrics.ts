import 'server-only';
import { GetValidationMetrics, type ValidationMetricsSnapshot } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function metricsDto(value: ValidationMetricsSnapshot) {
  return {
    ...value,
    period: { from: value.period.from.toISOString(), to: value.period.to.toISOString() },
  };
}

export async function getValidationMetricsResponse(request: Request, workspaceId: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const url = new URL(request.url);
    const parsed = z
      .object({ from: dateSchema, to: dateSchema })
      .strict()
      .safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid query');
    const from = new Date(`${parsed.data.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.data.to}T00:00:00.000Z`);
    const db = await import('@bunshin/database');
    const value = await new GetValidationMetrics(
      new db.PrismaValidationMetricsRepository(),
    ).execute({ workspaceId, actorUserId: user.userId, from, to });
    return Response.json(
      { data: metricsDto(value), requestId },
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
