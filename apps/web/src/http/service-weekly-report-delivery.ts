import 'server-only';
import { ServiceFoundationService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';
import {
  readWeeklyReportDeliverySetting,
  writeWeeklyReportDeliverySetting,
} from '../services/weekly-report-line-delivery';

const updateSchema = z
  .object({
    enabled: z.boolean(),
    weekday: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    localTime: z.string().regex(/^(0[7-9]|1\d|20):[0-5]\d$/),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export async function updateServiceWeeklyReportDeliveryResponse(
  request: Request,
  serviceSlug: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, value] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      updateSchema.parseAsync(request.json()),
    ]);
    const db = await import('@bunshin/database');
    const configuration = await new ServiceFoundationService(
      new db.PrismaServiceFoundationRepository(),
    ).save({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      reason: value.reason,
      configuration: {
        ...service.configuration,
        registration: {
          ...service.configuration.registration,
          onboardingConfig: writeWeeklyReportDeliverySetting(
            service.configuration.registration.onboardingConfig,
            {
              enabled: value.enabled,
              weekday: value.weekday,
              localTime: value.localTime,
            },
          ),
        },
      },
    });
    return Response.json({
      data: readWeeklyReportDeliverySetting(configuration.registration.onboardingConfig),
      requestId,
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
