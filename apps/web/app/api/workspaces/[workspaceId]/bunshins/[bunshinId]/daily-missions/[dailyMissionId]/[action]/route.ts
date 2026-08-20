import {
  transitionDailyMissionResponse,
  type DailyMissionAction,
} from '../../../../../../../../../src/http/daily-missions';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';

type Context = {
  params: Promise<{
    workspaceId: string;
    bunshinId: string;
    dailyMissionId: string;
    action: string;
  }>;
};
const actions = ['viewed', 'started', 'completed', 'skipped', 'expired'] as const;

export async function POST(request: Request, context: Context) {
  const value = await context.params;
  if (!actions.includes(value.action as DailyMissionAction)) {
    const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
    const mapped = toApiError(
      new ApplicationError('NOT_FOUND', 'mission action not found'),
      requestId,
    );
    return Response.json(mapped.body, { status: mapped.status });
  }
  return transitionDailyMissionResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.dailyMissionId,
    value.action as DailyMissionAction,
  );
}
