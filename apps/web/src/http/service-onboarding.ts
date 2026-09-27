import 'server-only';
import {
  CreateBunshin,
  ListServiceBunshins,
  ServiceReferralRewardService,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';
import { buildServiceOnboardingAnswers } from '../services/service-onboarding-response';
import {
  MINIMAL_BUSINESS_PROFILE_DEFAULTS,
  readServiceOnboardingSettings,
} from '../services/service-onboarding-settings';
import { defaultBusinessPartner } from '../services/default-business-partner';

const purposes = [
  'ATTRACT',
  'RESERVATION',
  'SALES',
  'RECRUITING',
  'AWARENESS',
  'RETENTION',
] as const;
const businessProfileSchema = z
  .object({
    primaryIndustryId: z.string().uuid(),
    otherIndustryText: z.string().trim().max(160).nullable(),
    businessName: z.string().trim().min(1).max(200),
    region: z.string().trim().max(160).nullable(),
    productService: z.string().trim().min(1).max(1000),
    primaryPurpose: z.enum(purposes),
    targetAudience: z.string().trim().min(1).max(500),
    websiteUrl: z.string().trim().url().max(2048).nullable(),
    businessFeatures: z.string().trim().max(1000).default(''),
    priceInformation: z.string().trim().max(500).nullable(),
    preferredTone: z.string().trim().max(80).default(''),
    requiredContent: z.string().trim().max(1000).nullable(),
    forbiddenContent: z.string().trim().max(1000).nullable(),
  })
  .strict();
const answersSchema = z
  .object({
    answers: z.array(z.string().min(1).max(1000)).max(7),
    businessProfile: businessProfileSchema.nullable().default(null),
  })
  .strict();

export async function saveServiceOnboardingResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    }
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, value] = await Promise.all([
      resolvePublicServiceContext(serviceSlug),
      answersSchema.parseAsync(await request.json()),
    ]);
    const settings = readServiceOnboardingSettings(
      service.configuration.registration.onboardingConfig,
      service.configuration.registration.surveyConfig,
    );
    if (value.answers.length !== settings.questions.length) {
      throw new ApplicationError('VALIDATION_ERROR', 'all onboarding answers are required');
    }
    if (settings.businessProfileEnabled !== Boolean(value.businessProfile)) {
      throw new ApplicationError('VALIDATION_ERROR', 'service business profile is required');
    }
    if (
      value.businessProfile &&
      settings.businessProfileInputMode === 'FULL' &&
      (!value.businessProfile.businessFeatures || !value.businessProfile.preferredTone)
    ) {
      throw new ApplicationError('VALIDATION_ERROR', 'complete business profile is required');
    }
    const businessProfile = value.businessProfile
      ? {
          ...value.businessProfile,
          businessFeatures:
            value.businessProfile.businessFeatures ||
            MINIMAL_BUSINESS_PROFILE_DEFAULTS.businessFeatures,
          preferredTone:
            value.businessProfile.preferredTone || MINIMAL_BUSINESS_PROFILE_DEFAULTS.preferredTone,
        }
      : null;
    const entries = buildServiceOnboardingAnswers(settings.questions, value.answers);
    const db = await import('@bunshin/database');
    const membership = await db.prisma.groupMembership.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: actor.userId,
        status: 'ACTIVE',
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!membership) throw new ApplicationError('FORBIDDEN', 'active service membership required');
    if (businessProfile) {
      const industry = await db.prisma.industry.findFirst({
        where: { id: businessProfile.primaryIndustryId, status: 'ACTIVE' },
        select: { key: true },
      });
      if (!industry) throw new ApplicationError('VALIDATION_ERROR', 'industry is unavailable');
      if (industry.key === 'OTHER' && !businessProfile.otherIndustryText) {
        throw new ApplicationError('VALIDATION_ERROR', 'other industry is required');
      }
    }
    const saved = await db.prisma.$transaction(async (tx) => {
      const response = await tx.serviceOnboardingResponse.upsert({
        where: { groupMembershipId: membership.id },
        create: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          groupMembershipId: membership.id,
          userId: actor.userId,
          questionsSnapshot: settings.questions,
          answers: entries,
        },
        update: {
          questionsSnapshot: settings.questions,
          answers: entries,
          completedAt: new Date(),
        },
        select: { id: true, completedAt: true },
      });
      if (businessProfile) {
        await tx.serviceMemberBusinessProfile.upsert({
          where: { groupMembershipId: membership.id },
          create: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            groupMembershipId: membership.id,
            userId: actor.userId,
            ...businessProfile,
          },
          update: businessProfile,
        });
      }
      return response;
    });
    await new ServiceReferralRewardService(
      new db.PrismaServiceReferralRewardRepository(),
    ).completeMilestone({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      referredUserId: actor.userId,
      milestone: 'ONBOARDING_COMPLETED',
    });
    let bunshinId: string | null = null;
    if (businessProfile) {
      const repository = new db.PrismaBunshinRepository();
      const existing = await new ListServiceBunshins(repository).execute({
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        actorUserId: actor.userId,
      });
      const bunshin =
        existing[0] ??
        (await new CreateBunshin(repository).execute({
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          actorUserId: actor.userId,
          slug: `service-${crypto.randomUUID()}`,
          type: 'EXPERT',
          ...defaultBusinessPartner(businessProfile),
        }));
      bunshinId = bunshin.id;
    }
    return Response.json(
      { data: { ...saved, bunshinId }, requestId },
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
