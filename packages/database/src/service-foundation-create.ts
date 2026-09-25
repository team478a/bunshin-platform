import type { ServiceFoundationRepository } from '@bunshin/application';
import type { Prisma, PrismaClient } from './client';
import { serviceFoundationRecord } from './service-records';

export async function createServiceFoundation(
  client: PrismaClient,
  input: Parameters<ServiceFoundationRepository['create']>[0],
) {
  return client.$transaction(async (tx) => {
    const [admin, workspace, existingGroup] = await Promise.all([
      tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      }),
      tx.workspace.findFirst({
        where: { id: input.workspaceId, type: 'ORGANIZATION', status: 'ACTIVE' },
        select: { id: true },
      }),
      input.groupId
        ? tx.group.findFirst({
            where: {
              id: input.groupId,
              workspaceId: input.workspaceId,
              status: 'ACTIVE',
              serviceConfiguration: { is: null },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (admin === null || workspace === null || (input.groupId && existingGroup === null))
      return null;
    const now = new Date();
    const entitlement = await tx.organizationEntitlement.findUnique({
      where: { workspaceId: input.workspaceId },
      select: {
        maxGroups: true,
        maxServices: true,
        oemEnabled: true,
        fortunePackageEnabled: true,
        suspended: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (
      entitlement?.suspended ||
      (entitlement?.startsAt && entitlement.startsAt > now) ||
      (entitlement?.endsAt && entitlement.endsAt <= now)
    )
      return null;
    const [groupCount, serviceCount] = await Promise.all([
      entitlement?.maxGroups
        ? tx.group.count({ where: { workspaceId: input.workspaceId, status: 'ACTIVE' } })
        : Promise.resolve(0),
      entitlement?.maxServices
        ? tx.serviceConfiguration.count({ where: { workspaceId: input.workspaceId } })
        : Promise.resolve(0),
    ]);
    if (!input.groupId && entitlement?.maxGroups && groupCount >= entitlement.maxGroups)
      return null;
    if (entitlement?.maxServices && serviceCount >= entitlement.maxServices) return null;
    if (input.requiredFeature === 'FORTUNE_PACKAGE' && entitlement?.fortunePackageEnabled !== true)
      return null;
    const value = input.configuration;
    if (entitlement && !entitlement.oemEnabled && !value.poweredByEnabled) return null;
    const group = existingGroup
      ? existingGroup
      : await tx.group.create({
          data: {
            workspaceId: input.workspaceId,
            name: value.displayName,
            memberships: {
              create: {
                workspaceId: input.workspaceId,
                userId: input.actorUserId,
                role: 'MANAGER',
                serviceRole: 'SERVICE_OWNER',
                status: 'ACTIVE',
                consentedAt: new Date(),
              },
            },
          },
        });
    if (existingGroup) {
      await tx.groupMembership.upsert({
        where: { groupId_userId: { groupId: group.id, userId: input.actorUserId } },
        create: {
          workspaceId: input.workspaceId,
          groupId: group.id,
          userId: input.actorUserId,
          role: 'MANAGER',
          serviceRole: 'SERVICE_OWNER',
          status: 'ACTIVE',
          consentedAt: now,
        },
        update: {
          role: 'MANAGER',
          serviceRole: 'SERVICE_OWNER',
          status: 'ACTIVE',
          consentedAt: now,
          declinedAt: null,
          revokedAt: null,
        },
      });
    }
    const configuration = await tx.serviceConfiguration.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: group.id,
        slug: value.slug,
        displayName: value.displayName,
        description: value.description,
        operatorName: value.operatorName,
        contactEmail: value.contactEmail,
        visibility: value.visibility,
        poweredByEnabled: value.poweredByEnabled,
        trendResearchEnabled: value.trendResearchEnabled ?? true,
        startsAt: value.startsAt,
        endsAt: value.endsAt,
        termsUrl: value.termsUrl,
        privacyUrl: value.privacyUrl,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
      },
    });
    await Promise.all([
      tx.serviceBrand.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: group.id,
          configurationId: configuration.id,
          ...value.brand,
        },
      }),
      tx.serviceRegistrationPolicy.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: group.id,
          configurationId: configuration.id,
          ...value.registration,
          onboardingConfig: value.registration.onboardingConfig as Prisma.InputJsonValue,
          surveyConfig: value.registration.surveyConfig as Prisma.InputJsonValue,
        },
      }),
    ]);
    const saved = await tx.serviceConfiguration.findUniqueOrThrow({
      where: { id: configuration.id },
      include: { brand: true, registration: true },
    });
    const record = serviceFoundationRecord(saved);
    await tx.serviceConfigurationAudit.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: group.id,
        configurationId: configuration.id,
        action: 'CREATED',
        afterData: record as unknown as Prisma.InputJsonValue,
        reason: input.reason,
        performedByUserId: input.actorUserId,
      },
    });
    return record;
  });
}
