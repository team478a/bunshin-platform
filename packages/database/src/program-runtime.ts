import type { ProgramCoreRepository } from '@bunshin/application';
import { type Prisma, type PrismaClient, prisma } from './client';

export class PrismaProgramCoreRepository implements ProgramCoreRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async platformAdmin(actorUserId: string) {
    return (
      (await this.client.platformAdmin.findFirst({
        where: { userId: actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      })) !== null
    );
  }

  private async serviceManager(workspaceId: string, groupId: string, actorUserId: string) {
    return (
      (await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          status: 'ACTIVE',
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
          group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
        },
        select: { id: true },
      })) !== null
    );
  }

  async createTemplate(input: Parameters<ProgramCoreRepository['createTemplate']>[0]) {
    const allowed =
      input.visibility === 'PLATFORM'
        ? await this.platformAdmin(input.actorUserId)
        : input.ownerGroupId !== null &&
          (await this.serviceManager(input.workspaceId, input.ownerGroupId, input.actorUserId));
    if (!allowed) return null;
    return this.client.$transaction(async (tx) => {
      const row = await tx.programTemplate.create({
        data: {
          workspaceId: input.workspaceId,
          ownerGroupId: input.ownerGroupId,
          name: input.name,
          description: input.description,
          category: input.category,
          targetAudience: input.targetAudience,
          visibility: input.visibility,
          createdByUserId: input.actorUserId,
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.ownerGroupId,
          resourceType: 'PROGRAM_TEMPLATE',
          resourceId: row.id,
          action: 'CREATED',
          afterData: row,
          performedByUserId: input.actorUserId,
        },
      });
      return row;
    });
  }

  async createTemplateVersion(
    input: Parameters<ProgramCoreRepository['createTemplateVersion']>[0],
  ) {
    return this.client.$transaction(async (tx) => {
      const template = await tx.programTemplate.findFirst({
        where: { id: input.programTemplateId, workspaceId: input.workspaceId },
      });
      if (template === null) return null;
      const allowed =
        template.visibility === 'PLATFORM'
          ? await this.platformAdmin(input.actorUserId)
          : template.ownerGroupId !== null &&
            (await this.serviceManager(
              input.workspaceId,
              template.ownerGroupId,
              input.actorUserId,
            ));
      if (!allowed) return null;
      const latest = await tx.programTemplateVersion.aggregate({
        where: { workspaceId: input.workspaceId, programTemplateId: template.id },
        _max: { version: true },
      });
      const row = await tx.programTemplateVersion.create({
        data: {
          workspaceId: input.workspaceId,
          programTemplateId: template.id,
          version: (latest._max.version ?? 0) + 1,
          status: input.publish ? 'PUBLISHED' : 'DRAFT',
          definition: input.definition as Prisma.InputJsonValue,
          createdByUserId: input.actorUserId,
          publishedAt: input.publish ? new Date() : null,
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: template.ownerGroupId,
          resourceType: 'PROGRAM_TEMPLATE_VERSION',
          resourceId: row.id,
          action: input.publish ? 'PUBLISHED' : 'CREATED',
          afterData: row,
          performedByUserId: input.actorUserId,
        },
      });
      return row;
    });
  }

  async adoptProgram(input: Parameters<ProgramCoreRepository['adoptProgram']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const version = await tx.programTemplateVersion.findFirst({
        where: {
          id: input.programTemplateVersionId,
          workspaceId: input.workspaceId,
          status: 'PUBLISHED',
        },
      });
      if (version === null) return null;
      const template = await tx.programTemplate.findFirst({
        where: {
          id: version.programTemplateId,
          workspaceId: input.workspaceId,
          OR: [{ visibility: 'PLATFORM' }, { ownerGroupId: input.groupId }],
        },
        select: { id: true },
      });
      if (template === null) return null;
      const row = await tx.serviceProgram.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programTemplateVersionId: version.id,
          displayName: input.displayName,
          description: input.description,
          settings: input.settings as Prisma.InputJsonValue,
          createdByUserId: input.actorUserId,
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          resourceType: 'SERVICE_PROGRAM',
          resourceId: row.id,
          action: 'ADOPTED',
          afterData: row,
          performedByUserId: input.actorUserId,
        },
      });
      return row;
    });
  }

  async createOffering(input: Parameters<ProgramCoreRepository['createOffering']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const program = await tx.serviceProgram.findFirst({
        where: {
          id: input.serviceProgramId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
        },
      });
      if (program === null) return null;
      const latest = await tx.programOffering.aggregate({
        where: { serviceProgramId: program.id },
        _max: { version: true },
      });
      const row = await tx.programOffering.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          serviceProgramId: program.id,
          version: (latest._max.version ?? 0) + 1,
          isFree: input.isFree,
          priceReference: input.priceReference,
          ...input.responsibilities,
          termsSnapshot: input.termsSnapshot as Prisma.InputJsonValue,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          createdByUserId: input.actorUserId,
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          resourceType: 'PROGRAM_OFFERING',
          resourceId: row.id,
          action: 'CREATED',
          afterData: row,
          performedByUserId: input.actorUserId,
        },
      });
      return {
        ...row,
        responsibilities: {
          seller: row.seller,
          priceOwner: row.priceOwner,
          paymentOwner: row.paymentOwner,
          apiCostOwner: row.apiCostOwner,
          supportOwner: row.supportOwner,
          contentOwner: row.contentOwner,
          characterOwner: row.characterOwner,
        },
      };
    });
  }

  async enroll(input: Parameters<ProgramCoreRepository['enroll']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const [membership, program, offering] = await Promise.all([
        tx.groupMembership.findFirst({
          where: {
            id: input.groupMembershipId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            status: 'ACTIVE',
          },
        }),
        tx.serviceProgram.findFirst({
          where: {
            id: input.serviceProgramId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
          },
        }),
        tx.programOffering.findFirst({
          where: {
            id: input.programOfferingId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            serviceProgramId: input.serviceProgramId,
          },
        }),
      ]);
      if (membership === null || program === null || offering === null) return null;
      const offeringSnapshot = {
        version: offering.version,
        isFree: offering.isFree,
        priceReference: offering.priceReference,
        seller: offering.seller,
        priceOwner: offering.priceOwner,
        paymentOwner: offering.paymentOwner,
        apiCostOwner: offering.apiCostOwner,
        supportOwner: offering.supportOwner,
        contentOwner: offering.contentOwner,
        characterOwner: offering.characterOwner,
        terms: offering.termsSnapshot,
      };
      const row = await tx.programEnrollment.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: membership.id,
          serviceProgramId: program.id,
          programOfferingId: offering.id,
          supportMode: input.supportMode,
          goalSnapshot: input.goalSnapshot as Prisma.InputJsonValue,
          offeringSnapshot: offeringSnapshot,
          invitedByUserId: input.actorUserId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          resourceType: 'PROGRAM_ENROLLMENT',
          resourceId: row.id,
          action: 'INVITED',
          afterData: row,
          performedByUserId: input.actorUserId,
        },
      });
      return row;
    });
  }

  async findEnrollment(input: Parameters<ProgramCoreRepository['findEnrollment']>[0]) {
    const actorMembership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
      },
    });
    if (actorMembership === null) return null;
    const canReadOther = ['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(actorMembership.serviceRole);
    if (!canReadOther && actorMembership.id !== input.groupMembershipId) return null;
    return this.client.programEnrollment.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        serviceProgramId: input.serviceProgramId,
      },
    });
  }
}

export { PrismaProgramRuntimeRepository } from './program-runtime-execution';
