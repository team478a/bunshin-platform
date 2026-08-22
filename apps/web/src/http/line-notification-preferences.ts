import 'server-only';
import {
  GetLineNotificationPreference,
  LINE_NOTIFICATION_FREQUENCIES,
  UpdateLineNotificationPreference,
  type LineNotificationPreference,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuid = z.string().uuid();
const schema = z
  .object({
    enabled: z.boolean(),
    consentGranted: z.boolean(),
    localTime: z.string(),
    timezone: z.string().min(1).max(64),
    frequency: z.enum(LINE_NOTIFICATION_FREQUENCIES),
    quietHoursStart: z.string(),
    quietHoursEnd: z.string(),
    pausedUntil: z.iso.datetime().nullable(),
    reminderEnabled: z.boolean(),
  })
  .strict();

export const lineNotificationPreferenceDto = (value: LineNotificationPreference) => ({
  ...value,
  notificationConsentAt: value.notificationConsentAt?.toISOString() ?? null,
  pausedUntil: value.pausedUntil?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});

async function context(workspaceId: string, bunshinId: string) {
  const parsed = z
    .object({ workspaceId: uuid, bunshinId: uuid })
    .safeParse({ workspaceId, bunshinId });
  if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid resource id');
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  return {
    scope: { ...parsed.data, actorUserId: user.userId },
    repository: new db.PrismaLineNotificationPreferenceRepository(),
  };
}

async function respond(request: Request, operation: () => Promise<unknown>) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
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

export function getLineNotificationPreferenceResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    const { scope, repository } = await context(workspaceId, bunshinId);
    return lineNotificationPreferenceDto(
      await new GetLineNotificationPreference(repository).execute(scope),
    );
  });
}

export function updateLineNotificationPreferenceResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const { scope, repository } = await context(workspaceId, bunshinId);
    return lineNotificationPreferenceDto(
      await new UpdateLineNotificationPreference(repository).execute({
        ...scope,
        ...parsed.data,
        pausedUntil: parsed.data.pausedUntil ? new Date(parsed.data.pausedUntil) : null,
      }),
    );
  });
}
