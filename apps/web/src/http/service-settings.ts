import 'server-only';
import { ServiceFoundationService } from '@bunshin/application';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  enforceBusinessDailyServiceSettings,
  enforceBusinessFreeRegistrationSettings,
} from '../services/business-daily-service-settings';
import { resolveManagedServiceContext } from '../services/public-service';
import { readServiceOnboardingSettings } from '../services/service-onboarding-settings';

const logger = createLogger();

function errorIdentity(error: unknown) {
  if (error === null || typeof error !== 'object') return {};
  const candidate = error as { name?: unknown; code?: unknown; cause?: unknown };
  const validationError =
    error instanceof z.ZodError
      ? error
      : candidate.cause instanceof z.ZodError
        ? candidate.cause
        : null;
  return {
    ...(typeof candidate.name === 'string' ? { errorName: candidate.name } : {}),
    ...(typeof candidate.code === 'string' ? { databaseErrorCode: candidate.code } : {}),
    ...(validationError
      ? {
          validationIssues: validationError.issues.slice(0, 10).map((issue) => ({
            code: issue.code,
            path: issue.path.join('.'),
          })),
        }
      : {}),
  };
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const optionalUrl = z
  .union([z.literal(''), z.string().url().max(2048)])
  .transform((value) => value || null);

const scheduledDateTime = z
  .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)])
  .optional()
  .transform((value) => (value ? new Date(`${value}:00+09:00`).toISOString() : null));

export const serviceSettingsUpdateSchema = z
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
    businessProfileEnabled: z.boolean().default(false),
    businessProfileInputMode: z.enum(['FULL', 'MINIMAL']).default('FULL'),
    dailyIdeaDelivery: z
      .object({
        enabled: z.boolean(),
        cadence: z.enum(['DAILY', 'WEEKDAYS']),
        defaultNotificationTime: z.string().regex(/^(0[7-9]|1\d|20):[0-5]\d$/),
        lockCadence: z.boolean(),
        contentMode: z.enum(['IDEA', 'PROMPT', 'READY_TO_USE']),
        mediaMode: z.enum(['TEXT_ONLY', 'IMAGE', 'VIDEO', 'IMAGE_AND_VIDEO']),
        videoStyle: z.enum(['STANDARD', 'CALM', 'MINIMAL']).default('STANDARD'),
        videoBgm: z
          .object({
            enabled: z.boolean(),
            assetId: z.uuid().nullable(),
            volumePercent: z.number().int().min(5).max(30),
          })
          .strict()
          .default({ enabled: false, assetId: null, volumePercent: 12 }),
        videoNarration: z
          .object({
            enabled: z.boolean(),
            voice: z.enum(['marin', 'cedar', 'coral']),
            speed: z.enum(['SLOW', 'STANDARD']),
          })
          .strict()
          .default({ enabled: false, voice: 'marin', speed: 'SLOW' }),
        visualCharacter: z
          .object({
            enabled: z.boolean(),
            profileVersionId: z.uuid().nullable(),
          })
          .strict()
          .default({ enabled: false, profileVersionId: null }),
      })
      .strict()
      .default({
        enabled: false,
        cadence: 'DAILY',
        defaultNotificationTime: '08:00',
        lockCadence: false,
        contentMode: 'READY_TO_USE',
        mediaMode: 'TEXT_ONLY',
        videoStyle: 'STANDARD',
        videoBgm: { enabled: false, assetId: null, volumePercent: 12 },
        videoNarration: { enabled: false, voice: 'marin', speed: 'SLOW' },
        visualCharacter: { enabled: false, profileVersionId: null },
      }),
    reason: z.string().min(1).max(1000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dailyIdeaDelivery.videoBgm.enabled && !value.dailyIdeaDelivery.videoBgm.assetId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dailyIdeaDelivery', 'videoBgm', 'assetId'],
        message: '使用するBGMを選んでください。',
      });
    }
    if (
      value.dailyIdeaDelivery.videoBgm.enabled &&
      !['VIDEO', 'IMAGE_AND_VIDEO'].includes(value.dailyIdeaDelivery.mediaMode)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dailyIdeaDelivery', 'videoBgm', 'enabled'],
        message: 'BGMを使う場合は、動画を準備する設定を選んでください。',
      });
    }
    if (
      value.dailyIdeaDelivery.visualCharacter.enabled &&
      !value.dailyIdeaDelivery.visualCharacter.profileVersionId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dailyIdeaDelivery', 'visualCharacter', 'profileVersionId'],
        message: '使用するAIキャラクターを選んでください。',
      });
    }
    if (
      value.dailyIdeaDelivery.visualCharacter.enabled &&
      !['IMAGE', 'IMAGE_AND_VIDEO'].includes(value.dailyIdeaDelivery.mediaMode)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dailyIdeaDelivery', 'visualCharacter', 'enabled'],
        message: 'AIキャラクターを使う場合は、画像を準備する設定を選んでください。',
      });
    }
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

function normalizeServiceSettingsUpdatePayload(input: unknown): unknown {
  const value = record(input);
  if (!value) return input;
  const onboarding = readServiceOnboardingSettings(
    {
      businessProfileEnabled: value.businessProfileEnabled === true,
      businessProfileInputMode: value.businessProfileInputMode,
      profileQuestions: value.profileQuestions,
      dailyIdeaDelivery: value.dailyIdeaDelivery,
    },
    null,
  );
  return {
    ...value,
    profileQuestions: onboarding.profileQuestions,
    dailyIdeaDelivery: onboarding.dailyIdeaDelivery,
  };
}

export async function parseServiceSettingsUpdatePayload(input: unknown) {
  const result = await serviceSettingsUpdateSchema.safeParseAsync(
    normalizeServiceSettingsUpdatePayload(input),
  );
  if (!result.success) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'service settings update payload is invalid',
      result.error,
    );
  }
  return result.data;
}

export async function updateServiceSettingsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, parsedValue] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      request.json().then(parseServiceSettingsUpdatePayload),
    ]);
    const value = enforceBusinessFreeRegistrationSettings(
      enforceBusinessDailyServiceSettings(parsedValue),
    );
    const current = service.configuration;
    const db = await import('@bunshin/database');
    if (value.dailyIdeaDelivery.videoBgm.enabled) {
      const track = await db.prisma.videoAsset.findFirst({
        where: {
          id: value.dailyIdeaDelivery.videoBgm.assetId!,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          ownerUserId: actor.userId,
          kind: 'AUDIO',
          status: 'READY',
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      });
      if (!track) throw new ApplicationError('VALIDATION_ERROR', '選んだBGMを使用できません');
    }
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
            businessProfileEnabled: value.businessProfileEnabled,
            businessProfileInputMode: value.businessProfileInputMode,
            dailyIdeaDelivery: value.dailyIdeaDelivery,
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
    logger.error('service settings update failed', {
      requestId,
      route: `/api/services/${serviceSlug}/settings`,
      status: mapped.status,
      errorCode: mapped.body.error.code,
      ...errorIdentity(error),
    });
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
