import 'server-only';
import { parseProgramDefinition } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuid = z.string().uuid();

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
    offeringClassification: z.enum(['FREE', 'PAID', 'PAID_BUNDLE']).optional(),
  })
  .strict();

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
        (value.monthlyPriceYen === null ||
          (value.monthlyPriceYen < 1 && value.offeringClassification !== 'PAID_BUNDLE')))
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
      const oemContract = await tx.organizationCommercialContract.findUnique({
        where: { workspaceId: configuration.workspaceId },
        select: { id: true },
      });
      const programs = oemContract
        ? await tx.serviceProgram.findMany({
            where: { workspaceId: configuration.workspaceId, groupId: configuration.groupId },
            select: { programTemplateVersionId: true },
          })
        : [];
      const versions = programs.length
        ? await tx.programTemplateVersion.findMany({
            where: {
              workspaceId: configuration.workspaceId,
              id: { in: programs.map((p) => p.programTemplateVersionId) },
            },
            select: { definition: true },
          })
        : [];
      const isOemTraining = versions.some((v) =>
        parseProgramDefinition(v.definition).missions.some((m) => m.capability === 'AI_TRAINING'),
      );
      const currentOffering = await tx.oemOfferingPeriod.findFirst({
        where: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          endsAt: null,
        },
      });
      if (value.offeringClassification && !currentOffering)
        throw new ApplicationError('VALIDATION_ERROR', '商品ポリシーの初期確認が必要です');
      if (isOemTraining && (!currentOffering || currentOffering.productPolicy !== 'MANABERU_STYLE'))
        throw new ApplicationError('VALIDATION_ERROR', 'AI研修の商品ポリシー確認が必要です');
      if (
        currentOffering?.productPolicy === 'MANABERU_STYLE' &&
        (value.offeringClassification === 'FREE' ||
          (value.billingMode === 'FREE' &&
            (value.offeringClassification ?? currentOffering.classification) !== 'PAID_BUNDLE'))
      )
        throw new ApplicationError('VALIDATION_ERROR', 'MANABERU_OEM_FREE_FORBIDDEN');
      if (
        currentOffering &&
        value.offeringClassification &&
        value.offeringClassification !== currentOffering.classification
      ) {
        await tx.$queryRaw(
          db.Prisma
            .sql`SELECT "id" FROM "workspaces" WHERE "id" = ${configuration.workspaceId}::uuid FOR UPDATE`,
        );
        const now = new Date();
        const closed = await tx.oemOfferingPeriod.updateMany({
          where: { id: currentOffering.id, endsAt: null },
          data: { endsAt: now },
        });
        if (closed.count !== 1)
          throw new ApplicationError('CONFLICT', '提供区分が更新されています');
        await tx.oemOfferingPeriod.create({
          data: {
            workspaceId: configuration.workspaceId,
            groupId: configuration.groupId,
            productPolicy: currentOffering.productPolicy,
            classification: value.offeringClassification,
            startsAt: now,
            actorUserId: user.userId,
            reason: value.reason,
          },
        });
      }
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
