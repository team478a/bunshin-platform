import 'server-only';
import { ServiceFoundationService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { enforceBusinessFreeRegistrationSettings } from '../services/business-daily-service-settings';
import {
  SERVICE_CREATION_TEMPLATE_KEYS,
  SERVICE_CREATION_TEMPLATES,
} from '../services/service-creation-templates';

const uuid = z.string().uuid();
const optionalUrl = z
  .union([z.literal(''), z.string().url().max(2048)])
  .transform((v) => v || null);
const createSchema = z
  .object({
    workspaceId: uuid,
    groupId: z.union([z.literal(''), uuid]).transform((v) => v || undefined),
    templateKey: z.enum(SERVICE_CREATION_TEMPLATE_KEYS).default('CUSTOM'),
    slug: z.string().min(1).max(80),
    displayName: z.string().min(1).max(120),
    description: z.string().min(1).max(1000),
    operatorName: z.string().min(1).max(160),
    contactEmail: z.union([z.literal(''), z.string().email().max(320)]).transform((v) => v || null),
    visibility: z.enum(['PUBLIC', 'PRIVATE']),
    poweredByEnabled: z.boolean(),
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

export async function createServiceResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = createSchema.parse(await request.json());
    const template = SERVICE_CREATION_TEMPLATES[value.templateKey];
    const businessProfileEnabled =
      'businessProfileEnabled' in template ? template.businessProfileEnabled : false;
    const dailyIdeaDelivery =
      'dailyIdeaDelivery' in template
        ? template.dailyIdeaDelivery
        : {
            enabled: false as const,
            cadence: 'DAILY' as const,
            defaultNotificationTime: '08:00',
            lockCadence: false as const,
            contentMode: 'READY_TO_USE' as const,
          };
    const fortunePackage = 'fortunePackage' in template ? template.fortunePackage : null;
    const registration = enforceBusinessFreeRegistrationSettings({
      businessProfileEnabled,
      registrationMode: value.registrationMode,
      emailEnabled: value.emailEnabled,
      lineEnabled: value.lineEnabled,
      inviteCodeEnabled: value.inviteCodeEnabled,
      referralEnabled: value.referralEnabled,
    });
    const db = await import('@bunshin/database');
    const service = await new ServiceFoundationService(
      new db.PrismaServiceFoundationRepository(),
    ).create({
      workspaceId: value.workspaceId,
      ...(value.groupId ? { groupId: value.groupId } : {}),
      ...(fortunePackage ? { requiredFeature: 'FORTUNE_PACKAGE' as const } : {}),
      actorUserId: user.userId,
      reason: value.reason,
      configuration: {
        slug: value.slug,
        displayName: value.displayName,
        description: value.description,
        operatorName: value.operatorName,
        contactEmail: value.contactEmail,
        visibility: value.visibility,
        poweredByEnabled: value.poweredByEnabled,
        startsAt: null,
        endsAt: null,
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
          mode: registration.registrationMode,
          emailEnabled: registration.emailEnabled,
          lineEnabled: registration.lineEnabled,
          inviteCodeEnabled: registration.inviteCodeEnabled,
          referralEnabled: registration.referralEnabled,
          onboardingConfig: {
            templateKey: value.templateKey,
            welcomeTitle: template.onboarding.welcomeTitle,
            welcomeMessage: template.onboarding.welcomeMessage,
            businessProfileEnabled,
            dailyIdeaDelivery,
            ...(fortunePackage ? { fortunePackage } : {}),
          },
          surveyConfig: { questions: [...template.onboarding.questions] },
        },
      },
    });
    return Response.json(
      { data: service, requestId },
      { status: 201, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
