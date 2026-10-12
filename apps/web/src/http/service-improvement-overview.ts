import 'server-only';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';
import {
  availableOverviewPackages,
  loadServiceOverviewPreview,
} from '../services/service-improvement-admin-data';
import { overviewPreviewWindow } from '../services/service-improvement-admin-preview';
import type { FeedbackPreviewQuery } from '../services/improvement-feedback-admin-preview';
const headers = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  vary: 'Cookie',
};
export async function serviceOverviewResponse(request: Request, slug: string): Promise<Response> {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      throw new ApplicationError('FORBIDDEN', 'cross-site read denied');
    if (request.headers.has('origin')) requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (request.method !== 'GET' || request.body)
      throw new ApplicationError('VALIDATION_ERROR', 'GET required');
    const url = new URL(request.url);
    if (url.search.length > 128) throw new ApplicationError('VALIDATION_ERROR', 'invalid query');
    const query: FeedbackPreviewQuery = {};
    for (const key of new Set(url.searchParams.keys())) {
      if (!['week', 'kind'].includes(key))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid query');
      const values = url.searchParams.getAll(key);
      query[key] = values.length === 1 ? values[0] : values;
    }
    const window = overviewPreviewWindow(query, new Date());
    if (window.outcome !== 'WINDOW')
      throw new ApplicationError(
        'VALIDATION_ERROR',
        '表示できる週を選び直してください。追加の絞り込み指定は受け付けません。',
      );
    const service = await resolveManagedServiceContext(slug, actor.userId, 'ADMINISTRATION').catch(
      (error: unknown) => {
        if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND')
          throw new ApplicationError('NOT_FOUND', 'managed service unavailable');
        throw error;
      },
    );
    if (!['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(service.serviceRole))
      throw new ApplicationError('NOT_FOUND', 'managed service unavailable');
    const scope = { workspaceId: service.workspaceId, serviceId: service.serviceId };
    if (!(await availableOverviewPackages(scope)).includes(window.packageKey))
      throw new ApplicationError('NOT_FOUND', 'overview unavailable');
    const data = await loadServiceOverviewPreview({
      ...scope,
      actorUserId: actor.userId,
      window,
      packageKey: window.packageKey,
    });
    return Response.json({ data }, { headers });
  } catch (error) {
    const mapped = toApiError(error, 'service-improvement-overview');
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
