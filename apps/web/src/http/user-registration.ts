import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { safeLineAuthReturnPath } from '../auth/line-return';
import { currentLineEnvironment } from '../line/secure-configuration';

const purposes = [
  'ATTRACT',
  'RESERVATION',
  'SALES',
  'RECRUITING',
  'AWARENESS',
  'RETENTION',
] as const;
const updateSchema = z
  .object({
    currentStep: z.number().int().min(1).max(4),
    primaryIndustryId: z.string().uuid().nullable().optional(),
    otherIndustryText: z.string().trim().max(160).nullable().optional(),
    primaryPurpose: z.enum(purposes).nullable().optional(),
    secondaryPurposes: z.array(z.enum(purposes)).max(5).optional(),
    activityName: z.string().trim().max(120).nullable().optional(),
    businessName: z.string().trim().max(200).nullable().optional(),
    region: z.string().trim().max(160).nullable().optional(),
    productService: z.string().trim().max(1000).nullable().optional(),
    socialProfiles: z
      .array(z.object({ platform: z.string().trim().max(40), url: z.string().url().max(2048) }))
      .max(10)
      .optional(),
    notificationConsent: z.boolean().optional(),
    returnTo: z.string().max(2048).nullable().optional(),
    complete: z.boolean().optional(),
  })
  .strict();

export async function userRegistrationResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const db = await import('@bunshin/database');
    if (request.method === 'GET') {
      const [profile, industries] = await Promise.all([
        db.prisma.userRegistrationProfile.findUnique({ where: { userId: actor.userId } }),
        db.prisma.industry.findMany({
          where: { status: 'ACTIVE' },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        }),
      ]);
      return Response.json(
        { data: { profile, industries }, requestId },
        { headers: { 'cache-control': 'private, no-store' } },
      );
    }
    requireSameOrigin(request);
    const value = updateSchema.parse(await request.json());
    if (
      value.complete &&
      (!value.primaryIndustryId || !value.primaryPurpose || !value.activityName)
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'industry, purpose and activity name are required',
      );
    if (value.primaryIndustryId) {
      const industry = await db.prisma.industry.findFirst({
        where: { id: value.primaryIndustryId, status: 'ACTIVE' },
        select: { key: true },
      });
      if (!industry) throw new ApplicationError('VALIDATION_ERROR', 'industry is unavailable');
      if (industry.key === 'OTHER' && !value.otherIndustryText)
        throw new ApplicationError('VALIDATION_ERROR', 'other industry is required');
    }
    const now = new Date();
    const { complete, notificationConsent, returnTo, ...fields } = value;
    const registrationFields = {
      currentStep: fields.currentStep,
      primaryIndustryId: fields.primaryIndustryId ?? null,
      otherIndustryText: fields.otherIndustryText ?? null,
      primaryPurpose: fields.primaryPurpose ?? null,
      secondaryPurposes: fields.secondaryPurposes ?? [],
      activityName: fields.activityName ?? null,
      businessName: fields.businessName ?? null,
      region: fields.region ?? null,
      productService: fields.productService ?? null,
      socialProfiles: fields.socialProfiles ?? [],
    };
    const profile = await db.prisma.$transaction(async (tx) => {
      const saved = await tx.userRegistrationProfile.upsert({
        where: { userId: actor.userId },
        create: {
          userId: actor.userId,
          ...registrationFields,
          status: complete ? 'COMPLETED' : 'IN_PROGRESS',
          startedAt: now,
          completedAt: complete ? now : null,
        },
        update: {
          ...registrationFields,
          status: complete ? 'COMPLETED' : 'IN_PROGRESS',
          completedAt: complete ? now : null,
        },
      });
      if (complete && notificationConsent !== undefined)
        await tx.lineConnection.updateMany({
          where: { userId: actor.userId, environment: currentLineEnvironment(), status: 'ACTIVE' },
          data: { notificationConsentAt: notificationConsent ? now : null },
        });
      return saved;
    });
    return Response.json(
      { data: profile, destination: safeLineAuthReturnPath(returnTo) ?? '/bunshins', requestId },
      { status: 200, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
