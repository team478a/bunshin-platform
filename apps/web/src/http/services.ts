import 'server-only';
import { ServiceFoundationService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  SERVICE_CREATION_TEMPLATE_KEYS,
  SERVICE_CREATION_TEMPLATES,
} from '../services/service-creation-templates';
import { enforceBusinessFreeRegistrationSettings } from '../services/business-daily-service-settings';
import {
  type VercelCustomDomainProvider,
  vercelCustomDomainProviderFromEnvironment,
} from '../services/vercel-custom-domain';

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

const lifecycleSchema = z
  .object({
    visibility: z.enum(['PUBLIC', 'PRIVATE']),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    poweredByEnabled: z.boolean(),
    startsAt: z.string().datetime({ offset: true }).nullable(),
    endsAt: z.string().datetime({ offset: true }).nullable(),
    reason: z.string().min(1).max(1000),
  })
  .strict();

const commercialSettingsSchema = z
  .object({
    planName: z.string().trim().min(1).max(120),
    billingMode: z.enum(['FREE', 'MANUAL_INVOICE', 'EXTERNAL_BILLING']),
    status: z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED']),
    monthlyPriceYen: z.number().int().min(0).max(100_000_000).nullable(),
    includedMemberLimit: z.number().int().min(1).max(1_000_000).nullable(),
    monthlyAiGenerationLimit: z.number().int().min(1).max(1_000_000).nullable(),
    monthlyImageGenerationLimit: z.number().int().min(1).max(1_000_000).nullable(),
    monthlyVideoGenerationLimit: z.number().int().min(1).max(1_000_000).nullable(),
    startsAt: z.string().datetime({ offset: true }).nullable(),
    endsAt: z.string().datetime({ offset: true }).nullable(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

const customDomainSchema = z
  .object({
    hostname: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(253)
      .regex(/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
    status: z.enum(['DRAFT', 'VERIFIED', 'ACTIVE', 'DISABLED']),
    verificationNote: z.union([z.literal(''), z.string().trim().max(1000)]),
    reason: z.string().trim().min(1).max(1000),
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

export async function updateServiceLifecycleResponse(request: Request, configurationId: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!uuid.safeParse(configurationId).success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service id');
    const value = lifecycleSchema.parse(await request.json());
    const startsAt = value.startsAt === null ? null : new Date(value.startsAt);
    const endsAt = value.endsAt === null ? null : new Date(value.endsAt);
    if (startsAt !== null && endsAt !== null && startsAt >= endsAt)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service period');

    const db = await import('@bunshin/database');
    const saved = await db.prisma.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: user.userId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (admin === null)
        throw new ApplicationError('FORBIDDEN', 'platform administrator required');
      const existing = await tx.serviceConfiguration.findUnique({
        where: { id: configurationId },
        include: { group: { select: { status: true } } },
      });
      if (existing === null) throw new ApplicationError('NOT_FOUND', 'service not found');
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: existing.workspaceId },
        select: { oemEnabled: true, suspended: true },
      });
      if (entitlement?.suspended)
        throw new ApplicationError('FORBIDDEN', 'organization operations are suspended');
      if (entitlement && !entitlement.oemEnabled && !value.poweredByEnabled)
        throw new ApplicationError('FORBIDDEN', 'OEM is not included in the organization contract');

      const [configuration, group] = await Promise.all([
        tx.serviceConfiguration.update({
          where: { id: configurationId },
          data: {
            visibility: value.visibility,
            poweredByEnabled: value.poweredByEnabled,
            startsAt,
            endsAt,
            updatedByUserId: user.userId,
          },
        }),
        tx.group.update({
          where: { id: existing.groupId },
          data: { status: value.status },
          select: { status: true },
        }),
      ]);
      const beforeData = {
        visibility: existing.visibility,
        status: existing.group.status,
        poweredByEnabled: existing.poweredByEnabled,
        startsAt: existing.startsAt?.toISOString() ?? null,
        endsAt: existing.endsAt?.toISOString() ?? null,
      };
      const afterData = {
        visibility: configuration.visibility,
        status: group.status,
        poweredByEnabled: configuration.poweredByEnabled,
        startsAt: configuration.startsAt?.toISOString() ?? null,
        endsAt: configuration.endsAt?.toISOString() ?? null,
      };
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: existing.workspaceId,
          groupId: existing.groupId,
          configurationId: existing.id,
          action:
            value.status === 'SUSPENDED'
              ? 'SUSPENDED'
              : existing.group.status === 'SUSPENDED'
                ? 'REACTIVATED'
                : 'LIFECYCLE_UPDATED',
          beforeData,
          afterData,
          reason: value.reason.trim(),
          performedByUserId: user.userId,
        },
      });
      return { id: existing.id, ...afterData };
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

export async function updateServiceCommercialSettingsResponse(
  request: Request,
  configurationId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!uuid.safeParse(configurationId).success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service id');
    const value = commercialSettingsSchema.parse(await request.json());
    if (
      (value.billingMode === 'FREE' &&
        value.monthlyPriceYen !== null &&
        value.monthlyPriceYen !== 0) ||
      (value.billingMode !== 'FREE' &&
        (value.monthlyPriceYen === null || value.monthlyPriceYen < 1))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid commercial price');
    const startsAt = value.startsAt === null ? null : new Date(value.startsAt);
    const endsAt = value.endsAt === null ? null : new Date(value.endsAt);
    if (startsAt !== null && endsAt !== null && startsAt >= endsAt)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service period');

    const db = await import('@bunshin/database');
    const saved = await db.prisma.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: user.userId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (admin === null)
        throw new ApplicationError('FORBIDDEN', 'platform administrator required');
      const configuration = await tx.serviceConfiguration.findUnique({
        where: { id: configurationId },
        include: { commercialSetting: true },
      });
      if (configuration === null) throw new ApplicationError('NOT_FOUND', 'service not found');
      const beforeData = configuration.commercialSetting
        ? {
            planName: configuration.commercialSetting.planName,
            billingMode: configuration.commercialSetting.billingMode,
            status: configuration.commercialSetting.status,
            monthlyPriceYen: configuration.commercialSetting.monthlyPriceYen,
            includedMemberLimit: configuration.commercialSetting.includedMemberLimit,
            monthlyAiGenerationLimit: configuration.commercialSetting.monthlyAiGenerationLimit,
            monthlyImageGenerationLimit:
              configuration.commercialSetting.monthlyImageGenerationLimit,
            monthlyVideoGenerationLimit:
              configuration.commercialSetting.monthlyVideoGenerationLimit,
            startsAt: configuration.commercialSetting.startsAt?.toISOString() ?? null,
            endsAt: configuration.commercialSetting.endsAt?.toISOString() ?? null,
          }
        : {};
      const commercialSetting = await tx.serviceCommercialSetting.upsert({
        where: { groupId: configuration.groupId },
        create: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          configurationId: configuration.id,
          planName: value.planName,
          billingMode: value.billingMode,
          status: value.status,
          monthlyPriceYen: value.monthlyPriceYen,
          includedMemberLimit: value.includedMemberLimit,
          monthlyAiGenerationLimit: value.monthlyAiGenerationLimit,
          monthlyImageGenerationLimit: value.monthlyImageGenerationLimit,
          monthlyVideoGenerationLimit: value.monthlyVideoGenerationLimit,
          startsAt,
          endsAt,
          updatedByUserId: user.userId,
        },
        update: {
          planName: value.planName,
          billingMode: value.billingMode,
          status: value.status,
          monthlyPriceYen: value.monthlyPriceYen,
          includedMemberLimit: value.includedMemberLimit,
          monthlyAiGenerationLimit: value.monthlyAiGenerationLimit,
          monthlyImageGenerationLimit: value.monthlyImageGenerationLimit,
          monthlyVideoGenerationLimit: value.monthlyVideoGenerationLimit,
          startsAt,
          endsAt,
          updatedByUserId: user.userId,
        },
      });
      const afterData = {
        planName: commercialSetting.planName,
        billingMode: commercialSetting.billingMode,
        status: commercialSetting.status,
        monthlyPriceYen: commercialSetting.monthlyPriceYen,
        includedMemberLimit: commercialSetting.includedMemberLimit,
        monthlyAiGenerationLimit: commercialSetting.monthlyAiGenerationLimit,
        monthlyImageGenerationLimit: commercialSetting.monthlyImageGenerationLimit,
        monthlyVideoGenerationLimit: commercialSetting.monthlyVideoGenerationLimit,
        startsAt: commercialSetting.startsAt?.toISOString() ?? null,
        endsAt: commercialSetting.endsAt?.toISOString() ?? null,
      };
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          configurationId: configuration.id,
          action: 'COMMERCIAL_SETTINGS_UPDATED',
          beforeData,
          afterData,
          reason: value.reason,
          performedByUserId: user.userId,
        },
      });
      return afterData;
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

export async function updateServiceCustomDomainResponse(request: Request, configurationId: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!uuid.safeParse(configurationId).success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service id');
    const value = customDomainSchema.parse(await request.json());
    if (['ACTIVE', 'VERIFIED'].includes(value.status))
      throw new ApplicationError(
        'VALIDATION_ERROR',
        '独自ドメインの公開機能は準備中です。準備中として保存してください。',
      );
    if (
      ['localhost', 'vercel.app'].some(
        (suffix) => value.hostname === suffix || value.hostname.endsWith(`.${suffix}`),
      )
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid custom domain');
    if (
      process.env.APP_URL &&
      value.hostname === new URL(process.env.APP_URL).hostname.toLowerCase()
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'システム本体のドメインはサービス専用に設定できません。',
      );

    const db = await import('@bunshin/database');
    const saved = await db.prisma.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: user.userId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (admin === null)
        throw new ApplicationError('FORBIDDEN', 'platform administrator required');
      const configuration = await tx.serviceConfiguration.findUnique({
        where: { id: configurationId },
        include: { customDomain: true },
      });
      if (configuration === null) throw new ApplicationError('NOT_FOUND', 'service not found');
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: configuration.workspaceId },
        select: { customDomainEnabled: true, suspended: true },
      });
      if (entitlement?.suspended)
        throw new ApplicationError('FORBIDDEN', 'organization operations are suspended');
      if (entitlement && !entitlement.customDomainEnabled && value.status !== 'DISABLED')
        throw new ApplicationError(
          'FORBIDDEN',
          'custom domain is not included in the organization contract',
        );
      if (value.status === 'ACTIVE' && configuration.customDomain?.status !== 'VERIFIED')
        throw new ApplicationError('VALIDATION_ERROR', 'domain must be verified before activation');
      const now = new Date();
      const customDomain = await tx.serviceCustomDomain.upsert({
        where: { groupId: configuration.groupId },
        create: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          configurationId: configuration.id,
          hostname: value.hostname,
          status: value.status,
          verificationNote: value.verificationNote || null,
          verifiedAt: value.status === 'VERIFIED' ? now : null,
          activatedAt: null,
        },
        update: {
          hostname: value.hostname,
          status: value.status,
          verificationNote: value.verificationNote || null,
          verifiedAt: null,
          activatedAt: null,
        },
      });
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          configurationId: configuration.id,
          action: 'CUSTOM_DOMAIN_UPDATED',
          beforeData: configuration.customDomain
            ? {
                hostname: configuration.customDomain.hostname,
                status: configuration.customDomain.status,
                verificationNote: configuration.customDomain.verificationNote,
              }
            : {},
          afterData: {
            hostname: customDomain.hostname,
            status: customDomain.status,
            verificationNote: customDomain.verificationNote,
          },
          reason: value.reason,
          performedByUserId: user.userId,
        },
      });
      return {
        hostname: customDomain.hostname,
        status: customDomain.status,
        verificationNote: customDomain.verificationNote,
        verifiedAt: customDomain.verifiedAt?.toISOString() ?? null,
        activatedAt: customDomain.activatedAt?.toISOString() ?? null,
      };
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

export async function synchronizeServiceCustomDomainResponse(
  request: Request,
  configurationId: string,
  provider?: Pick<VercelCustomDomainProvider, 'synchronize'>,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!uuid.safeParse(configurationId).success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service id');

    const db = await import('@bunshin/database');
    const [admin, configuration] = await Promise.all([
      db.prisma.platformAdmin.findFirst({
        where: { userId: user.userId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      }),
      db.prisma.serviceConfiguration.findUnique({
        where: { id: configurationId },
        include: { customDomain: true },
      }),
    ]);
    if (!admin) throw new ApplicationError('FORBIDDEN', 'platform administrator required');
    if (!configuration?.customDomain)
      throw new ApplicationError('NOT_FOUND', 'custom domain not found');
    const entitlement = await db.prisma.organizationEntitlement.findUnique({
      where: { workspaceId: configuration.workspaceId },
      select: { customDomainEnabled: true, suspended: true },
    });
    if (entitlement?.suspended)
      throw new ApplicationError('FORBIDDEN', 'organization operations are suspended');
    if (entitlement && !entitlement.customDomainEnabled)
      throw new ApplicationError(
        'FORBIDDEN',
        'custom domain is not included in the organization contract',
      );
    if (configuration.customDomain.status === 'DISABLED')
      throw new ApplicationError('CONFLICT', '停止中の独自ドメインは確認できません。');

    const connection = await (provider ?? vercelCustomDomainProviderFromEnvironment()).synchronize(
      configuration.customDomain.hostname,
    );
    const now = new Date();
    const saved = await db.prisma.$transaction(async (tx) => {
      const current = await tx.serviceCustomDomain.findUnique({
        where: { id: configuration.customDomain!.id },
      });
      if (!current || current.hostname !== configuration.customDomain!.hostname)
        throw new ApplicationError(
          'CONFLICT',
          '確認中にドメインが変更されました。画面を更新してください。',
        );
      const customDomain = await tx.serviceCustomDomain.update({
        where: { id: current.id },
        data: {
          status: connection.status,
          verificationNote: connection.note,
          verifiedAt: connection.status === 'DRAFT' ? null : (current.verifiedAt ?? now),
          activatedAt: connection.status === 'ACTIVE' ? (current.activatedAt ?? now) : null,
        },
      });
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          configurationId: configuration.id,
          action: 'CUSTOM_DOMAIN_CONNECTION_SYNCHRONIZED',
          beforeData: {
            hostname: current.hostname,
            status: current.status,
            verificationNote: current.verificationNote,
          },
          afterData: {
            hostname: customDomain.hostname,
            status: customDomain.status,
            verificationNote: customDomain.verificationNote,
          },
          reason: 'VercelとDNSの接続状態を確認',
          performedByUserId: user.userId,
        },
      });
      return customDomain;
    });
    return Response.json(
      {
        data: {
          hostname: saved.hostname,
          status: saved.status,
          verificationNote: saved.verificationNote,
          verifiedAt: saved.verifiedAt?.toISOString() ?? null,
          activatedAt: saved.activatedAt?.toISOString() ?? null,
        },
        requestId,
      },
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
