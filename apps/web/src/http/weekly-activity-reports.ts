import 'server-only';

import { GetWeeklyActivityReport } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { resolvePublicServiceContext } from '../services/public-service';

const uuid = z.string().uuid();

function localWeekStart(now: Date, timezone: string) {
  let value: string;
  try {
    value = new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid timezone');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

async function actorUserId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

async function response(
  request: Request,
  scope: Promise<{ workspaceId: string; bunshinId: string; actorUserId: string; groupId?: string }>,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const url = new URL(request.url);
    const timezone = url.searchParams.get('timezone') || 'Asia/Tokyo';
    const weekStart = url.searchParams.get('weekStart') || localWeekStart(new Date(), timezone);
    const db = await import('@bunshin/database');
    const report = await new GetWeeklyActivityReport(
      new db.PrismaWeeklyActivityReportRepository(),
    ).execute({ ...(await scope), timezone, weekStart });
    return Response.json(
      { data: report, requestId },
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

export function getWorkspaceWeeklyActivityReportResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return response(
    request,
    (async () => ({
      workspaceId: uuid.parse(workspaceId),
      bunshinId: uuid.parse(bunshinId),
      actorUserId: await actorUserId(),
    }))(),
  );
}

export function getServiceWeeklyActivityReportResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return response(
    request,
    (async () => {
      const [service, actor] = await Promise.all([
        resolvePublicServiceContext(serviceSlug),
        actorUserId(),
      ]);
      return {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        bunshinId: uuid.parse(bunshinId),
        actorUserId: actor,
      };
    })(),
  );
}
