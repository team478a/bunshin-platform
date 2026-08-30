import 'server-only';
import { ServiceFoundationService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';

const optionalUrl = z
  .union([z.literal(''), z.string().url().max(2048)])
  .transform((value) => value || null);

const schema = z
  .object({
    displayName: z.string().min(1).max(120),
    description: z.string().min(1).max(1000),
    operatorName: z.string().min(1).max(160),
    contactEmail: z.union([z.literal(''), z.string().email().max(320)]).transform((v) => v || null),
    termsUrl: optionalUrl,
    privacyUrl: optionalUrl,
    logoUrl: optionalUrl,
    iconUrl: optionalUrl,
    faviconUrl: optionalUrl,
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    fontFamily: z.string().min(1).max(120),
    registrationMode: z.enum(['PUBLIC', 'INVITATION_ONLY', 'APPROVAL_REQUIRED', 'CLOSED']),
    emailEnabled: z.boolean(),
    lineEnabled: z.boolean(),
    inviteCodeEnabled: z.boolean(),
    referralEnabled: z.boolean(),
    reason: z.string().min(1).max(1000),
  })
  .strict();

export async function updateServiceSettingsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, value] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      schema.parseAsync(request.json()),
    ]);
    const current = service.configuration;
    const db = await import('@bunshin/database');
    const saved = await new ServiceFoundationService(
      new db.PrismaServiceFoundationRepository(),
    ).save({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      reason: value.reason,
      configuration: {
        ...current,
        displayName: value.displayName,
        description: value.description,
        operatorName: value.operatorName,
        contactEmail: value.contactEmail,
        termsUrl: value.termsUrl,
        privacyUrl: value.privacyUrl,
        brand: {
          logoUrl: value.logoUrl,
          iconUrl: value.iconUrl,
          faviconUrl: value.faviconUrl,
          primaryColor: value.primaryColor,
          secondaryColor: value.secondaryColor,
          fontFamily: value.fontFamily,
        },
        registration: {
          ...current.registration,
          mode: value.registrationMode,
          emailEnabled: value.emailEnabled,
          lineEnabled: value.lineEnabled,
          inviteCodeEnabled: value.inviteCodeEnabled,
          referralEnabled: value.referralEnabled,
        },
      },
    });
    return Response.json(
      { data: saved, requestId },
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
