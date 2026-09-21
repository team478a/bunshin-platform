import type { ServiceFoundationRepository, ServiceStaffRoleRepository } from '@bunshin/application';
import { type Prisma, type PrismaClient, prisma } from './client';
import { serviceFoundationRecord, serviceStaffRoleRecord } from './service-records';
export class PrismaServiceStaffRoleRepository implements ServiceStaffRoleRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async canManage(workspaceId: string, groupId: string, actorUserId: string) {
    const [platformAdmin, owner] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: { userId: actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      }),
      this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          status: 'ACTIVE',
          serviceRole: 'SERVICE_OWNER',
          group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
        },
        select: { id: true },
      }),
    ]);
    return platformAdmin !== null || owner !== null;
  }

  async list(input: Parameters<ServiceStaffRoleRepository['list']>[0]) {
    if (!(await this.canManage(input.workspaceId, input.groupId, input.actorUserId))) return null;
    const rows = await this.client.groupMembership.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      orderBy: [{ serviceRole: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(serviceStaffRoleRecord);
  }

  async set(input: Parameters<ServiceStaffRoleRepository['set']>[0]) {
    return this.client.$transaction(async (tx) => {
      const [platformAdmin, owner] = await Promise.all([
        tx.platformAdmin.findFirst({
          where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
          select: { id: true },
        }),
        tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            status: 'ACTIVE',
            serviceRole: 'SERVICE_OWNER',
            group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
          },
          select: { id: true },
        }),
      ]);
      if (platformAdmin === null && owner === null) return null;
      const target = await tx.groupMembership.findFirst({
        where: {
          id: input.membershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { in: ['ACTIVE', 'SUSPENDED'] },
          group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
        },
      });
      if (target === null || target.serviceRole === input.serviceRole)
        return target === null ? null : serviceStaffRoleRecord(target);
      if (target.serviceRole === 'SERVICE_OWNER' && input.serviceRole !== 'SERVICE_OWNER') {
        const owners = await tx.groupMembership.count({
          where: {
            groupId: input.groupId,
            serviceRole: 'SERVICE_OWNER',
            status: 'ACTIVE',
          },
        });
        if (owners <= 1) return null;
      }
      const legacyRole = ['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(input.serviceRole)
        ? 'MANAGER'
        : 'PARTICIPANT';
      const updated = await tx.groupMembership.update({
        where: { id: target.id },
        data: { serviceRole: input.serviceRole, role: legacyRole },
      });
      await tx.groupMembershipAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: target.id,
          action: 'ROLE_CHANGED',
          beforeData: { role: target.role, serviceRole: target.serviceRole, status: target.status },
          afterData: {
            role: updated.role,
            serviceRole: updated.serviceRole,
            status: updated.status,
          },
          reason: input.reason,
          performedByUserId: input.actorUserId,
          occurredAt: input.now,
        },
      });
      return serviceStaffRoleRecord(updated);
    });
  }
}

export class PrismaServiceFoundationRepository implements ServiceFoundationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async create(input: Parameters<ServiceFoundationRepository['create']>[0]) {
    return this.client.$transaction(async (tx) => {
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
      if (
        input.requiredFeature === 'FORTUNE_PACKAGE' &&
        entitlement?.fortunePackageEnabled !== true
      )
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

  async save(input: Parameters<ServiceFoundationRepository['save']>[0]) {
    return this.client.$transaction(async (tx) => {
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

  async findByGroup(input: Parameters<ServiceFoundationRepository['findByGroup']>[0]) {
    const [platformAdmin, access] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.client.group.findFirst({
        where: {
          id: input.groupId,
          workspaceId: input.workspaceId,
          OR: [
            {
              memberships: {
                some: { userId: input.actorUserId, role: 'MANAGER', status: 'ACTIVE' },
              },
            },
            {
              workspace: {
                memberships: {
                  some: {
                    userId: input.actorUserId,
                    role: { in: ['OWNER', 'ADMIN'] },
                    status: 'ACTIVE',
                  },
                },
              },
            },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (platformAdmin === null && access === null) return null;
    const value = await this.client.serviceConfiguration.findFirst({
      where: { workspaceId: input.workspaceId, groupId: input.groupId },
      include: { brand: true, registration: true },
    });
    return value === null ? null : serviceFoundationRecord(value);
  }

  async findPublicBySlug(input: Parameters<ServiceFoundationRepository['findPublicBySlug']>[0]) {
    const value = await this.client.serviceConfiguration.findFirst({
      where: {
        slug: input.slug,
        visibility: 'PUBLIC',
        group: { status: 'ACTIVE' },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
        ],
      },
      include: { brand: true, registration: true },
    });
    return value === null ? null : serviceFoundationRecord(value);
  }

  async findMemberBySlug(input: Parameters<ServiceFoundationRepository['findMemberBySlug']>[0]) {
    const value = await this.client.serviceConfiguration.findFirst({
      where: {
        slug: input.slug,
        group: {
          status: 'ACTIVE',
          workspace: { status: 'ACTIVE' },
          memberships: {
            some: { userId: input.actorUserId, status: 'ACTIVE' },
          },
        },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
        ],
      },
      include: { brand: true, registration: true },
    });
    return value === null ? null : serviceFoundationRecord(value);
  }
}
