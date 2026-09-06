import 'server-only';
import {
  EnqueueJob,
  GetBunshin,
  ScheduleWeeklyPlanPreparation,
  UpdateLineNotificationPreference,
} from '@bunshin/application';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';
import { currentLineEnvironment } from '../line/secure-configuration';
import { mondayForDate } from '../jobs/service-automatic-week';
import { ensureUserWorkspaceLineConnection } from '../line/ensure-user-workspace-connection';
import { readServiceOnboardingSettings } from '../services/service-onboarding-settings';

const schema = z
  .object({ enabled: z.boolean(), localTime: z.string().regex(/^(0[7-9]|1\d|20):[0-5]\d$/) })
  .strict();

export async function updateServiceAutomaticDelivery(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const parsed = schema.safeParse(await request.json().catch(() => null));
    const parsedId = z.string().uuid().safeParse(bunshinId);
    if (!parsed.success || !parsedId.success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery settings');
    const value = parsed.data;
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolvePublicServiceContext(serviceSlug);
    const deliveryPolicy = readServiceOnboardingSettings(
      service.configuration.registration.onboardingConfig,
      service.configuration.registration.surveyConfig,
    ).dailyIdeaDelivery;
    const db = await import('@bunshin/database');
    const scope = {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      bunshinId: parsedId.data,
      actorUserId: actor.userId,
    };
    await new GetBunshin(new db.PrismaBunshinRepository()).execute(scope);
    const weekStartDate = mondayForDate(
      new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }),
    );
    const scopes = new db.PrismaMissionAutomationScopeRepository();
    if (value.enabled && !(await scopes.validateWeekly({ ...scope, weekStartDate })))
      throw new ApplicationError('CONFLICT', '先に投稿するSNSと発信方法を設定してください。');
    if (
      value.enabled &&
      !(await ensureUserWorkspaceLineConnection(actor.userId, service.workspaceId, true))
    )
      throw new ApplicationError(
        'CONFLICT',
        'LINEでログインしてから、お届け設定を開始してください。',
      );
    await new UpdateLineNotificationPreference(
      new db.PrismaLineNotificationPreferenceRepository(),
    ).execute({
      ...scope,
      enabled: value.enabled,
      consentGranted: value.enabled,
      localTime: value.localTime,
      timezone: 'Asia/Tokyo',
      frequency: deliveryPolicy.enabled ? deliveryPolicy.cadence : 'DAILY',
      quietHoursStart: '21:00',
      quietHoursEnd: '07:00',
      pausedUntil: null,
      reminderEnabled: false,
    });
    if (value.enabled)
      await new ScheduleWeeklyPlanPreparation(
        new EnqueueJob(new db.PrismaJobRepository()),
        scopes,
      ).execute({
        ...scope,
        environment: currentLineEnvironment(),
        correlationId: requestId,
        weekStartDate,
      });
    return Response.json(
      { data: { enabled: value.enabled }, requestId },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
