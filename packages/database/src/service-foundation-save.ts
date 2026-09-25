import type { ServiceFoundationRepository } from '@bunshin/application';
import type { Prisma, PrismaClient } from './client';
import { serviceFoundationRecord } from './service-records';

export async function saveServiceFoundation(
  client: PrismaClient,
  input: Parameters<ServiceFoundationRepository['save']>[0],
) {
  return client.$transaction(async (tx) => {
    const [admin, group, manager, existing, entitlement] = await Promise.all([
      tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      }),
      tx.group.findFirst({
        where: { id: input.groupId, workspaceId: input.workspaceId },
        select: { id: true },
      }),
      tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          role: 'MANAGER',
          status: 'ACTIVE',
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
        },
        select: { id: true },
      }),
      tx.serviceConfiguration.findUnique({
        where: { groupId: input.groupId },
        include: { brand: true, registration: true },
      }),
      tx.organizationEntitlement.findUnique({
        where: { workspaceId: input.workspaceId },
        select: { oemEnabled: true, suspended: true, startsAt: true, endsAt: true },
      }),
    ]);
    if ((admin === null && manager === null) || group === null) return null;
    const value = input.configuration;
    const now = new Date();
    if (
      entitlement?.suspended ||
      (entitlement?.startsAt && entitlement.startsAt > now) ||
      (entitlement?.endsAt && entitlement.endsAt <= now) ||
      (entitlement && !entitlement.oemEnabled && !value.poweredByEnabled)
    )
      return null;
    if (
      admin === null &&
      (existing === null ||
        value.slug !== existing.slug ||
        value.visibility !== existing.visibility ||
        value.poweredByEnabled !== existing.poweredByEnabled ||
        value.startsAt?.getTime() !== existing.startsAt?.getTime() ||
        value.endsAt?.getTime() !== existing.endsAt?.getTime())
    )
      return null;
    const configuration = await tx.serviceConfiguration.upsert({
      where: { groupId: input.groupId },
      create: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
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
      update: {
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
        updatedByUserId: input.actorUserId,
      },
    });
    await Promise.all([
      tx.serviceBrand.upsert({
        where: { groupId: input.groupId },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          configurationId: configuration.id,
          ...value.brand,
        },
        update: value.brand,
      }),
      tx.serviceRegistrationPolicy.upsert({
        where: { groupId: input.groupId },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          configurationId: configuration.id,
          ...value.registration,
          onboardingConfig: value.registration.onboardingConfig as Prisma.InputJsonValue,
          surveyConfig: value.registration.surveyConfig as Prisma.InputJsonValue,
        },
        update: {
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
    await tx.serviceConfigurationAudit.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        configurationId: configuration.id,
        action: existing === null ? 'CREATED' : 'UPDATED',
        ...(existing === null
          ? {}
          : {
              beforeData: serviceFoundationRecord(existing) as unknown as Prisma.InputJsonValue,
            }),
        afterData: serviceFoundationRecord(saved) as unknown as Prisma.InputJsonValue,
        reason: input.reason,
        performedByUserId: input.actorUserId,
      },
    });
    return serviceFoundationRecord(saved);
  });
}
