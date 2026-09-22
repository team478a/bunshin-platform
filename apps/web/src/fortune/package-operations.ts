import 'server-only';
import {
  buildStandardFortuneKnowledgePack,
  parseFortuneKnowledgePack,
  type FortuneKnowledgePack,
} from '@bunshin/capability-fortune';
import { ApplicationError } from '@bunshin/shared';
import { isFortunePackageLicenseActive } from '../services/fortune-package-license';
import {
  CURRENT_FORTUNE_PACKAGE_VERSION,
  FORTUNE_INITIAL_MEMBER_LIMIT,
  FORTUNE_PACKAGE_KEY,
  fortunePackageReleaseStatus,
  isFortuneServicePackage,
} from '../services/service-creation-templates';
import { fortuneOperatorScope } from './operator-scope';

export interface FortunePackageAuditEntry {
  id: string;
  action: 'INSTALLED' | 'UPDATED';
  fromVersion: number | null;
  toVersion: number;
  occurredAt: Date;
  actor: string;
}

const FORTUNE_PACKAGE_INSTALLED_ACTION = 'FORTUNE_PACKAGE_INSTALLED';
const FORTUNE_PACKAGE_UPDATED_ACTION = 'FORTUNE_PACKAGE_UPDATED';

export async function fortunePackageAuditHistory(
  serviceSlug: string,
  actorUserId: string,
  limit = 20,
): Promise<FortunePackageAuditEntry[]> {
  const service = await fortuneOperatorScope(serviceSlug, actorUserId);
  const db = await import('@bunshin/database');
  const rows = await db.prisma.serviceConfigurationAudit.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      configurationId: service.configuration.id,
      action: { in: [FORTUNE_PACKAGE_INSTALLED_ACTION, FORTUNE_PACKAGE_UPDATED_ACTION] },
    },
    select: {
      id: true,
      action: true,
      beforeData: true,
      afterData: true,
      occurredAt: true,
      performedBy: { select: { displayName: true, email: true } },
    },
    orderBy: { occurredAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
  });

  return rows.flatMap((row) => {
    const before = jsonObject(row.beforeData);
    const after = jsonObject(row.afterData);
    const toVersion = after?.['packageVersion'];
    const fromVersion = before?.['packageVersion'];
    if (typeof toVersion !== 'number') return [];
    return [
      {
        id: row.id,
        action: row.action === FORTUNE_PACKAGE_INSTALLED_ACTION ? 'INSTALLED' : 'UPDATED',
        fromVersion: typeof fromVersion === 'number' ? fromVersion : null,
        toVersion,
        occurredAt: row.occurredAt,
        actor: row.performedBy.displayName || row.performedBy.email || '運営担当者',
      } satisfies FortunePackageAuditEntry,
    ];
  });
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function importFortuneKnowledge(input: {
  serviceSlug: string;
  actorUserId: string;
  bunshinId: string;
  pack: unknown;
}): Promise<{ version: number; meaningCount: number }> {
  const service = await fortuneOperatorScope(input.serviceSlug, input.actorUserId);
  const pack: FortuneKnowledgePack = parseFortuneKnowledgePack(input.pack);
  const db = await import('@bunshin/database');
  return db.prisma.$transaction(async (tx) => {
    const [configuration, bunshin] = await Promise.all([
      tx.serviceConfiguration.findFirst({
        where: {
          id: service.configuration.id,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
        },
        select: { id: true },
      }),
      tx.bunshin.findFirst({
        where: {
          id: input.bunshinId,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    ]);
    if (!configuration || !bunshin)
      throw new ApplicationError('NOT_FOUND', 'service Bunshin not found');
    const existingAssignment = await tx.bunshinCapabilityAssignment.findUnique({
      where: {
        workspaceId_bunshinId_capabilityType: {
          workspaceId: service.workspaceId,
          bunshinId: bunshin.id,
          capabilityType: 'FORTUNE',
        },
      },
      select: { status: true },
    });
    if (existingAssignment?.status === 'LOCKED')
      throw new ApplicationError('CONFLICT', 'locked capability cannot be activated');
    await tx.bunshinCapabilityAssignment.upsert({
      where: {
        workspaceId_bunshinId_capabilityType: {
          workspaceId: service.workspaceId,
          bunshinId: bunshin.id,
          capabilityType: 'FORTUNE',
        },
      },
      create: {
        workspaceId: service.workspaceId,
        bunshinId: bunshin.id,
        capabilityType: 'FORTUNE',
        status: 'ACTIVE',
        assignedByUserId: input.actorUserId,
      },
      update: {
        status: 'ACTIVE',
        assignedByUserId: input.actorUserId,
        activatedAt: new Date(),
      },
    });
    const previousSetting = await tx.fortuneServiceSetting.findUnique({
      where: { groupId: service.serviceId },
      select: {
        bunshinId: true,
        bunshin: {
          select: {
            capabilityAssignments: {
              where: { capabilityType: 'FORTUNE' },
              select: { id: true, status: true },
              take: 1,
            },
          },
        },
      },
    });
    if (previousSetting && previousSetting.bunshinId !== bunshin.id) {
      const previousAssignment = previousSetting.bunshin.capabilityAssignments[0];
      if (previousAssignment?.status === 'LOCKED')
        throw new ApplicationError('CONFLICT', 'locked capability cannot be moved');
      if (previousAssignment)
        await tx.bunshinCapabilityAssignment.update({
          where: { id: previousAssignment.id },
          data: { status: 'SUSPENDED' },
        });
    }
    const setting = await tx.fortuneServiceSetting.upsert({
      where: { groupId: service.serviceId },
      create: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: configuration.id,
        bunshinId: bunshin.id,
      },
      update: { bunshinId: bunshin.id },
      select: { id: true },
    });
    const latest = await tx.fortuneKnowledgeVersion.aggregate({
      where: { serviceSettingId: setting.id },
      _max: { version: true },
    });
    const version = (latest._max.version ?? 0) + 1;
    const knowledge = await tx.fortuneKnowledgeVersion.create({
      data: {
        serviceSettingId: setting.id,
        version,
        status: 'DRAFT',
        promptVersion: pack.promptVersion,
      },
      select: { id: true },
    });
    await tx.fortuneCardMeaning.createMany({
      data: pack.meanings.map((meaning) => ({
        knowledgeVersionId: knowledge.id,
        ...meaning,
        safetyReviewed: true,
      })),
    });
    await tx.fortuneKnowledgeVersion.updateMany({
      where: { serviceSettingId: setting.id, status: 'APPROVED' },
      data: { status: 'RETIRED' },
    });
    await tx.fortuneKnowledgeVersion.update({
      where: { id: knowledge.id },
      data: {
        status: 'APPROVED',
        approvedByUserId: input.actorUserId,
        approvedAt: new Date(),
      },
    });
    return { version, meaningCount: pack.meanings.length };
  });
}

export async function importStandardFortuneKnowledge(input: {
  serviceSlug: string;
  actorUserId: string;
  bunshinId: string;
}) {
  return importFortuneKnowledge({
    ...input,
    pack: buildStandardFortuneKnowledgePack(),
  });
}

export async function installStandardFortunePackage(input: {
  serviceSlug: string;
  actorUserId: string;
}): Promise<{
  installed: boolean;
  bunshinId: string;
  version: number | null;
  meaningCount: number;
}> {
  const service = await fortuneOperatorScope(input.serviceSlug, input.actorUserId);
  if (!isFortuneServicePackage(service.configuration.registration.onboardingConfig))
    throw new ApplicationError('CONFLICT', 'fortune package is not selected for this service');

  const pack = buildStandardFortuneKnowledgePack();
  const db = await import('@bunshin/database');
  return db.prisma.$transaction(async (tx) => {
    const configuration = await tx.serviceConfiguration.findFirst({
      where: {
        id: service.configuration.id,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
      },
      select: {
        id: true,
        registration: { select: { onboardingConfig: true } },
        fortuneSetting: {
          select: {
            bunshinId: true,
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
    });
    if (!configuration) throw new ApplicationError('NOT_FOUND', 'service not found');
    if (!configuration.fortuneSetting) {
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: service.workspaceId },
        select: {
          fortunePackageEnabled: true,
          suspended: true,
          startsAt: true,
          endsAt: true,
        },
      });
      if (!isFortunePackageLicenseActive(entitlement))
        throw new ApplicationError(
          'FORBIDDEN',
          'fortune package is not enabled for this organization',
        );
    }
    await tx.serviceCommercialSetting.upsert({
      where: { groupId: service.serviceId },
      create: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: configuration.id,
        planName: '占い限定公開 v1',
        billingMode: 'FREE',
        status: 'ACTIVE',
        monthlyPriceYen: null,
        includedMemberLimit: FORTUNE_INITIAL_MEMBER_LIMIT,
        monthlyAiGenerationLimit: null,
        monthlyImageGenerationLimit: null,
        monthlyVideoGenerationLimit: null,
        updatedByUserId: input.actorUserId,
      },
      update: {},
    });
    if (configuration.fortuneSetting) {
      const approved = configuration.fortuneSetting.knowledgeVersions[0];
      return {
        installed: false,
        bunshinId: configuration.fortuneSetting.bunshinId,
        version: approved?.version ?? null,
        meaningCount: approved?._count.cardMeanings ?? 0,
      };
    }

    const bunshin = await tx.bunshin.create({
      data: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        ownerUserId: input.actorUserId,
        name: '占い案内パートナー',
        slug: `fortune-${crypto.randomUUID()}`,
        type: 'EXPERT',
        status: 'ACTIVE',
        objectiveSummary: '毎日のカードを、安心して受け取れる生活のヒントとして案内します。',
        audienceSummary: '18歳以上の占いサービス参加者へ、恋愛・仕事・人間関係のヒントを届けます。',
        personalitySummary:
          '不安をあおらず、結果を断定せず、落ち着いた日本語で小さな行動を提案します。',
      },
      select: { id: true },
    });
    await tx.bunshinCapabilityAssignment.create({
      data: {
        workspaceId: service.workspaceId,
        bunshinId: bunshin.id,
        capabilityType: 'FORTUNE',
        status: 'ACTIVE',
        assignedByUserId: input.actorUserId,
      },
    });
    const setting = await tx.fortuneServiceSetting.create({
      data: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: configuration.id,
        bunshinId: bunshin.id,
        enabled: false,
        aiEnabled: false,
        minimumAge: 18,
        historyRetentionDays: 90,
        weeklyNotificationEnabled: false,
      },
      select: { id: true },
    });
    const knowledge = await tx.fortuneKnowledgeVersion.create({
      data: {
        serviceSettingId: setting.id,
        version: 1,
        status: 'DRAFT',
        promptVersion: pack.promptVersion,
      },
      select: { id: true },
    });
    await tx.fortuneCardMeaning.createMany({
      data: pack.meanings.map((meaning) => ({
        knowledgeVersionId: knowledge.id,
        ...meaning,
        safetyReviewed: true,
      })),
    });
    await tx.fortuneKnowledgeVersion.update({
      where: { id: knowledge.id },
      data: {
        status: 'APPROVED',
        approvedByUserId: input.actorUserId,
        approvedAt: new Date(),
      },
    });
    if (!configuration.registration)
      throw new ApplicationError('CONFLICT', 'fortune package metadata is unavailable');
    await tx.serviceRegistrationPolicy.update({
      where: { configurationId: configuration.id },
      data: {
        onboardingConfig: packageConfigAtCurrentVersion(
          configuration.registration.onboardingConfig,
        ),
      },
    });
    await tx.serviceConfigurationAudit.create({
      data: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: configuration.id,
        action: FORTUNE_PACKAGE_INSTALLED_ACTION,
        beforeData: { packageVersion: null },
        afterData: {
          packageKey: FORTUNE_PACKAGE_KEY,
          packageVersion: CURRENT_FORTUNE_PACKAGE_VERSION,
          knowledgeVersion: 1,
          meaningCount: pack.meanings.length,
        },
        reason: '占い標準パッケージを初回導入',
        performedByUserId: input.actorUserId,
      },
    });
    return {
      installed: true,
      bunshinId: bunshin.id,
      version: 1,
      meaningCount: pack.meanings.length,
    };
  });
}

function packageConfigAtCurrentVersion(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApplicationError('CONFLICT', 'fortune package metadata is unavailable');
  const onboarding = value as Record<string, unknown>;
  const selected = onboarding['fortunePackage'];
  if (!selected || typeof selected !== 'object' || Array.isArray(selected))
    throw new ApplicationError('CONFLICT', 'fortune package metadata is unavailable');
  return {
    ...onboarding,
    fortunePackage: {
      ...(selected as Record<string, unknown>),
      key: FORTUNE_PACKAGE_KEY,
      version: CURRENT_FORTUNE_PACKAGE_VERSION,
    },
  };
}

export async function updateStandardFortunePackage(input: {
  serviceSlug: string;
  actorUserId: string;
}): Promise<{ updated: boolean; fromVersion: number; toVersion: number }> {
  const service = await fortuneOperatorScope(input.serviceSlug, input.actorUserId);
  const release = fortunePackageReleaseStatus(service.configuration.registration.onboardingConfig);
  if (release.state === 'NOT_SELECTED' || release.installedVersion === null)
    throw new ApplicationError('CONFLICT', 'fortune package is not selected for this service');
  if (release.state === 'UNSUPPORTED_NEWER')
    throw new ApplicationError('CONFLICT', 'installed fortune package is newer than this system');
  if (release.state === 'CURRENT')
    return {
      updated: false,
      fromVersion: release.installedVersion,
      toVersion: release.currentVersion,
    };

  const db = await import('@bunshin/database');
  return db.prisma.$transaction(async (tx) => {
    const configuration = await tx.serviceConfiguration.findFirst({
      where: {
        id: service.configuration.id,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
      },
      select: {
        id: true,
        registration: { select: { onboardingConfig: true } },
        fortuneSetting: { select: { id: true } },
      },
    });
    if (!configuration?.fortuneSetting)
      throw new ApplicationError(
        'CONFLICT',
        'install the fortune package before applying an update',
      );

    await tx.serviceCommercialSetting.upsert({
      where: { groupId: service.serviceId },
      create: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: configuration.id,
        planName: '占い限定公開 v1',
        billingMode: 'FREE',
        status: 'ACTIVE',
        monthlyPriceYen: null,
        includedMemberLimit: FORTUNE_INITIAL_MEMBER_LIMIT,
        monthlyAiGenerationLimit: null,
        monthlyImageGenerationLimit: null,
        monthlyVideoGenerationLimit: null,
        updatedByUserId: input.actorUserId,
      },
      update: {},
    });
    if (!configuration.registration)
      throw new ApplicationError('CONFLICT', 'fortune package metadata is unavailable');
    await tx.serviceRegistrationPolicy.update({
      where: { configurationId: configuration.id },
      data: {
        onboardingConfig: packageConfigAtCurrentVersion(
          configuration.registration.onboardingConfig,
        ),
      },
    });
    await tx.serviceConfigurationAudit.create({
      data: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: configuration.id,
        action: FORTUNE_PACKAGE_UPDATED_ACTION,
        beforeData: { packageVersion: release.installedVersion },
        afterData: {
          packageKey: FORTUNE_PACKAGE_KEY,
          packageVersion: release.currentVersion,
        },
        reason: '占い標準パッケージを最新版へ更新',
        performedByUserId: input.actorUserId,
      },
    });
    return {
      updated: true,
      fromVersion: release.installedVersion!,
      toVersion: release.currentVersion,
    };
  });
}
