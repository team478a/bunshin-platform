import 'server-only';
import {
  ConnectLineMessagingAccount,
  EnqueueJob,
  GetLineNotificationPreference,
  ScheduleWeeklyPlanPreparation,
} from '@bunshin/application';
import { mondayForDate } from '../jobs/service-automatic-week';
import { currentLineEnvironment } from './secure-configuration';
import { resolveMemberServiceContext } from '../services/public-service';
import { readServiceOnboardingSettings } from '../services/service-onboarding-settings';

export type ServiceBunshinNotificationResult =
  | 'ENABLED'
  | 'LINE_DISABLED'
  | 'DEDICATED_LINE_REQUIRED'
  | 'FRIENDSHIP_NOT_CONFIRMED'
  | 'LEGAL_CONSENT_REQUIRED'
  | 'NO_BUNSHINS'
  | 'BUNSHIN_NOT_READY'
  | 'SCHEDULING_RETRY_REQUIRED';

/** Enable existing owner Bunshins only after an explicit, service-scoped opt-in. */
export async function enableServiceBunshinNotifications(input: {
  serviceSlug: string;
  actorUserId: string;
  verifiedProviderUserId: string;
  friendshipConfirmed: boolean;
}): Promise<ServiceBunshinNotificationResult> {
  const service = await resolveMemberServiceContext(input.serviceSlug, input.actorUserId);
  const db = await import('@bunshin/database');
  const environment = currentLineEnvironment();
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: input.actorUserId,
      status: 'ACTIVE',
      user: { status: 'ACTIVE' },
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { consentedAt: true },
  });
  const legalConsent = membership?.consentedAt
    ? await new db.PrismaServiceParticipationRepository().findLegalConsentView({
        slug: input.serviceSlug,
        actorUserId: input.actorUserId,
        now: new Date(),
      })
    : null;
  if (
    !membership?.consentedAt ||
    !legalConsent ||
    !legalConsent.legalDocuments.every(({ id }) => legalConsent.acceptedDocumentIds.includes(id))
  )
    return 'LEGAL_CONSENT_REQUIRED';

  const policy = await db.prisma.groupLineRoutingPolicy.findUnique({
    where: {
      workspaceId_groupId_environment: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        environment,
      },
    },
    select: { mode: true },
  });
  if (policy?.mode === 'DEDICATED') return 'DEDICATED_LINE_REQUIRED';
  if (policy?.mode === 'DISABLED') return 'LINE_DISABLED';
  if (!input.friendshipConfirmed) {
    // Keep a non-consented Workspace connection so a later official-account FOLLOW webhook
    // can record the friendship state. Notification preferences remain disabled.
    await new ConnectLineMessagingAccount(new db.PrismaLineConnectionRepository()).execute({
      environment,
      workspaceId: service.workspaceId,
      actorUserId: input.actorUserId,
      verifiedProviderUserId: input.verifiedProviderUserId,
      consentGranted: false,
    });
    return 'FRIENDSHIP_NOT_CONFIRMED';
  }

  const bunshins = await db.prisma.bunshin.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: input.actorUserId,
      status: { not: 'ARCHIVED' },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (bunshins.length === 0) return 'NO_BUNSHINS';

  const scope = new db.PrismaMissionAutomationScopeRepository();
  const weekStartDate = mondayForDate(
    new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }),
  );
  const scopes = bunshins.map((bunshin) => ({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    bunshinId: bunshin.id,
    actorUserId: input.actorUserId,
  }));
  for (const bunshinScope of scopes) {
    if (!(await scope.validateWeekly({ ...bunshinScope, weekStartDate })))
      return 'BUNSHIN_NOT_READY';
  }

  await new ConnectLineMessagingAccount(new db.PrismaLineConnectionRepository()).execute({
    environment,
    workspaceId: service.workspaceId,
    actorUserId: input.actorUserId,
    verifiedProviderUserId: input.verifiedProviderUserId,
    consentGranted: true,
  });
  await db.prisma.lineConnection.update({
    where: {
      environment_workspaceId_userId: {
        environment,
        workspaceId: service.workspaceId,
        userId: input.actorUserId,
      },
    },
    data: {
      friendshipStatus: 'FOLLOWING',
      followedAt: new Date(),
      unfollowedAt: null,
    },
  });

  const delivery = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  ).dailyIdeaDelivery;
  const preferences = new db.PrismaLineNotificationPreferenceRepository();
  const getPreference = new GetLineNotificationPreference(preferences);
  const previousPreferences = await Promise.all(scopes.map((item) => getPreference.execute(item)));

  await db.prisma.$transaction(async (tx) => {
    const stillOwned = await tx.bunshin.findMany({
      where: {
        id: { in: bunshins.map(({ id }) => id) },
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        ownerUserId: input.actorUserId,
        status: { not: 'ARCHIVED' },
      },
      select: { id: true },
    });
    if (stillOwned.length !== bunshins.length) throw new Error('BUNSHIN_SCOPE_CHANGED');

    for (const [index, bunshinScope] of scopes.entries()) {
      const previous = previousPreferences[index]!;
      const data = {
        enabled: true,
        notificationConsentAt: previous.notificationConsentAt ?? new Date(),
        localTime: previous.localTime,
        timezone: previous.timezone,
        frequency: delivery.enabled ? delivery.cadence : previous.frequency,
        quietHoursStart: previous.quietHoursStart,
        quietHoursEnd: previous.quietHoursEnd,
        pausedUntil: previous.pausedUntil,
        reminderEnabled: previous.reminderEnabled,
      };
      await tx.lineNotificationPreference.upsert({
        where: {
          workspaceId_userId_bunshinId: {
            workspaceId: bunshinScope.workspaceId,
            userId: bunshinScope.actorUserId,
            bunshinId: bunshinScope.bunshinId,
          },
        },
        create: {
          workspaceId: bunshinScope.workspaceId,
          userId: bunshinScope.actorUserId,
          bunshinId: bunshinScope.bunshinId,
          ...data,
        },
        update: data,
      });
    }
  });

  const schedule = new ScheduleWeeklyPlanPreparation(
    new EnqueueJob(new db.PrismaJobRepository()),
    scope,
  );
  try {
    for (const bunshinScope of scopes) {
      await schedule.execute({
        ...bunshinScope,
        environment,
        correlationId: `line-link:${input.actorUserId}:${bunshinScope.bunshinId}`,
        weekStartDate,
      });
    }
  } catch {
    return 'SCHEDULING_RETRY_REQUIRED';
  }
  return 'ENABLED';
}
