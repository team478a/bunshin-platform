import 'server-only';
import { FORTUNE_KNOWLEDGE_MEANING_COUNT } from '@bunshin/capability-fortune';
import { ApplicationError } from '@bunshin/shared';
import { currentLineEnvironment } from '../line/secure-configuration';
import {
  fortunePackageReleaseStatus,
  type FortunePackageReleaseStatus,
} from '../services/service-creation-templates';
import { isFortuneLineReady } from './launch-readiness';
import { fortuneOperatorScope } from './operator-scope';

export interface FortuneOperatorStatus {
  packageRelease: FortunePackageReleaseStatus;
  configured: boolean;
  enabled: boolean;
  aiEnabled: boolean;
  weeklyNotificationEnabled: boolean;
  weeklyNotificationDay: number;
  weeklyNotificationHour: number;
  timeZone: string;
  bunshinId: string | null;
  approvedVersion: number | null;
  approvedMeaningCount: number;
  requiredMeaningCount: number;
  termsReady: boolean;
  privacyReady: boolean;
  brandReady: boolean;
  lineReady: boolean;
  bunshinReady: boolean;
  canEnable: boolean;
  memberLimit: number | null;
  registeredParticipants: number;
  remainingParticipantSlots: number | null;
  bunshins: Array<{ id: string; name: string }>;
}

export async function fortuneOperatorStatus(
  serviceSlug: string,
  actorUserId: string,
): Promise<FortuneOperatorStatus> {
  const service = await fortuneOperatorScope(serviceSlug, actorUserId);
  const packageRelease = fortunePackageReleaseStatus(
    service.configuration.registration.onboardingConfig,
  );
  const db = await import('@bunshin/database');
  const lineEnvironment = currentLineEnvironment();
  const now = new Date();
  const [
    configuration,
    linePolicy,
    dedicatedLine,
    sharedLineReadyCount,
    commercialSetting,
    registeredParticipants,
  ] = await Promise.all([
    db.prisma.serviceConfiguration.findFirst({
      where: {
        id: service.configuration.id,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
      },
      select: {
        contactEmail: true,
        brand: { select: { logoUrl: true } },
        legalDocuments: {
          where: { status: 'PUBLISHED' },
          select: { type: true },
        },
        fortuneSetting: {
          select: {
            enabled: true,
            aiEnabled: true,
            weeklyNotificationEnabled: true,
            weeklyNotificationDay: true,
            weeklyNotificationHour: true,
            timeZone: true,
            bunshinId: true,
            bunshin: {
              select: {
                status: true,
                capabilityAssignments: {
                  where: { capabilityType: 'FORTUNE', status: 'ACTIVE' },
                  select: { id: true },
                },
              },
            },
            knowledgeVersions: {
              where: { status: 'APPROVED' },
              orderBy: { version: 'desc' },
              take: 1,
              select: {
                version: true,
                _count: { select: { cardMeanings: { where: { safetyReviewed: true } } } },
              },
            },
          },
        },
      },
    }),
    db.prisma.groupLineRoutingPolicy.findUnique({
      where: {
        workspaceId_groupId_environment: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          environment: lineEnvironment,
        },
      },
      select: { mode: true, pilotEnabled: true },
    }),
    db.prisma.groupLineChannelConfiguration.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        environment: lineEnvironment,
        status: 'ACTIVE',
      },
      select: { lastVerifiedAt: true, lastErrorCategory: true, globallyPaused: true },
    }),
    db.prisma.lineChannelConfiguration.count({
      where: {
        environment: lineEnvironment,
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    }),
    db.prisma.serviceCommercialSetting.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      select: { includedMemberLimit: true },
    }),
    db.prisma.groupMembership.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        role: 'PARTICIPANT',
        status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
      },
    }),
  ]);
  if (!configuration) throw new ApplicationError('NOT_FOUND', 'service not found');
  const bunshins = await db.prisma.bunshin.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      status: 'ACTIVE',
    },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const approved = configuration.fortuneSetting?.knowledgeVersions[0];
  const approvedMeaningCount = approved?._count.cardMeanings ?? 0;
  const termsReady = configuration.legalDocuments.some((item) => item.type === 'TERMS');
  const privacyReady = configuration.legalDocuments.some((item) => item.type === 'PRIVACY');
  const brandReady = Boolean(configuration.brand?.logoUrl && configuration.contactEmail);
  const lineMode = linePolicy?.mode ?? 'SHARED';
  const lineReady = isFortuneLineReady({
    registrationLineEnabled: service.configuration.registration.lineEnabled,
    mode: lineMode,
    sharedLineReadyCount,
    dedicatedPilotEnabled: linePolicy?.pilotEnabled ?? false,
    dedicatedLastVerifiedAt: dedicatedLine?.lastVerifiedAt ?? null,
    dedicatedLastErrorCategory: dedicatedLine?.lastErrorCategory ?? null,
    dedicatedGloballyPaused: dedicatedLine?.globallyPaused ?? true,
  });
  const bunshinReady = Boolean(
    configuration.fortuneSetting?.bunshin.status === 'ACTIVE' &&
    configuration.fortuneSetting.bunshin.capabilityAssignments.length === 1,
  );
  const memberLimit = commercialSetting?.includedMemberLimit ?? null;
  return {
    packageRelease,
    configured: Boolean(configuration.fortuneSetting),
    enabled: configuration.fortuneSetting?.enabled ?? false,
    aiEnabled: configuration.fortuneSetting?.aiEnabled ?? false,
    weeklyNotificationEnabled: configuration.fortuneSetting?.weeklyNotificationEnabled ?? false,
    weeklyNotificationDay: configuration.fortuneSetting?.weeklyNotificationDay ?? 3,
    weeklyNotificationHour: configuration.fortuneSetting?.weeklyNotificationHour ?? 19,
    timeZone: configuration.fortuneSetting?.timeZone ?? 'Asia/Tokyo',
    bunshinId: configuration.fortuneSetting?.bunshinId ?? null,
    approvedVersion: approved?.version ?? null,
    approvedMeaningCount,
    requiredMeaningCount: FORTUNE_KNOWLEDGE_MEANING_COUNT,
    termsReady,
    privacyReady,
    brandReady,
    lineReady,
    bunshinReady,
    canEnable:
      approvedMeaningCount === FORTUNE_KNOWLEDGE_MEANING_COUNT &&
      termsReady &&
      privacyReady &&
      brandReady &&
      lineReady &&
      bunshinReady,
    memberLimit,
    registeredParticipants,
    remainingParticipantSlots:
      memberLimit === null ? null : Math.max(0, memberLimit - registeredParticipants),
    bunshins,
  };
}
