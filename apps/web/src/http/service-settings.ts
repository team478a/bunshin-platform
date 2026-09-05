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

const scheduledDateTime = z
  .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)])
  .optional()
  .transform((value) => (value ? new Date(`${value}:00+09:00`).toISOString() : null));

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
    trendResearchEnabled: z.boolean().default(true),
    welcomeTitle: z.string().max(120).default(''),
    welcomeMessage: z.string().max(1000).default(''),
    announcementEnabled: z.boolean().default(false),
    announcementTitle: z.string().max(120).default(''),
    announcementMessage: z.string().max(1000).default(''),
    announcementStartsAt: scheduledDateTime,
    announcementEndsAt: scheduledDateTime,
    onboardingQuestions: z.array(z.string().min(1).max(200)).max(7).default([]),
    profileQuestions: z
      .object({
        industry: z.boolean(),
        purpose: z.boolean(),
        activityName: z.boolean(),
        businessName: z.boolean(),
        region: z.boolean(),
        productService: z.boolean(),
        socialProfile: z.boolean(),
        notificationConsent: z.boolean(),
      })
      .strict()
      .optional(),
    reason: z.string().min(1).max(1000),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.announcementEnabled) return;
    if (!value.announcementTitle.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['announcementTitle'],
        message: 'お知らせを表示する場合は見出しを入力してください。',
      });
    }
    if (!value.announcementMessage.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['announcementMessage'],
        message: 'お知らせを表示する場合は内容を入力してください。',
      });
    }
    if (
      value.announcementStartsAt &&
      value.announcementEndsAt &&
      new Date(value.announcementEndsAt) <= new Date(value.announcementStartsAt)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['announcementEndsAt'],
        message: '表示終了は表示開始より後の日時にしてください。',
      });
    }
  });

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
        trendResearchEnabled: value.trendResearchEnabled,
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
          onboardingConfig: {
            ...(typeof current.registration.onboardingConfig === 'object' &&
            current.registration.onboardingConfig !== null &&
            !Array.isArray(current.registration.onboardingConfig)
              ? current.registration.onboardingConfig
              : {}),
            welcomeTitle: value.welcomeTitle.trim(),
            welcomeMessage: value.welcomeMessage.trim(),
            ...(value.profileQuestions ? { profileQuestions: value.profileQuestions } : {}),
            announcementEnabled: value.announcementEnabled,
            announcementTitle: value.announcementTitle.trim(),
            announcementMessage: value.announcementMessage.trim(),
            announcementStartsAt: value.announcementStartsAt,
            announcementEndsAt: value.announcementEndsAt,
          },
          surveyConfig: { questions: value.onboardingQuestions.map((item) => item.trim()) },
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
