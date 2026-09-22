import type { ProgramCoreRepository, ProgramRuntimeRepository } from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
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

export class PrismaProgramRuntimeRepository implements ProgramRuntimeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async enrollmentAccess(
    input: {
      workspaceId: string;
      groupId: string;
      actorUserId: string;
      programEnrollmentId: string;
    },
    statuses: Array<'ACTIVE' | 'COMPLETED' | 'EXPIRED'> = ['ACTIVE'],
  ) {
    const [enrollment, actor] = await Promise.all([
      this.client.programEnrollment.findFirst({
        where: {
          id: input.programEnrollmentId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { in: statuses },
        },
      }),
      this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
        },
      }),
    ]);
    if (!enrollment || !actor) return null;
    const manager = ['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(actor.serviceRole);
    if (!manager && enrollment.groupMembershipId !== actor.id) return null;
    return enrollment;
  }

  private async versionMatchesEnrollment(input: {
    workspaceId: string;
    groupId: string;
    serviceProgramId: string;
    programTemplateVersionId: string;
  }) {
    return (
      (await this.client.serviceProgram.findFirst({
        where: {
          id: input.serviceProgramId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programTemplateVersionId: input.programTemplateVersionId,
          status: 'ACTIVE',
        },
        select: { id: true },
      })) !== null
    );
  }

  async createAssignment(input: Parameters<ProgramRuntimeRepository['createAssignment']>[0]) {
    const enrollment = await this.enrollmentAccess(input);
    if (
      !enrollment ||
      !(await this.versionMatchesEnrollment({
        ...input,
        serviceProgramId: enrollment.serviceProgramId,
      }))
    )
      return null;
    const existing = await this.client.programMissionAssignment.findUnique({
      where: {
        programEnrollmentId_sequence: {
          programEnrollmentId: enrollment.id,
          sequence: input.sequence,
        },
      },
    });
    if (existing) {
      if (
        existing.programTemplateVersionId !== input.programTemplateVersionId ||
        existing.routeKey !== input.routeKey ||
        existing.phaseKey !== input.phaseKey ||
        existing.missionDefinitionKey !== input.missionDefinitionKey ||
        existing.actionMode !== input.actionMode ||
        existing.reasonCode !== input.reasonCode ||
        existing.reevaluateAt?.getTime() !== input.reevaluateAt?.getTime() ||
        existing.variantKey !== input.variantKey
      )
        return null;
      return { assignment: existing, created: false };
    }
    try {
      const assignment = await this.client.programMissionAssignment.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          programTemplateVersionId: input.programTemplateVersionId,
          sequence: input.sequence,
          routeKey: input.routeKey,
          phaseKey: input.phaseKey,
          missionDefinitionKey: input.missionDefinitionKey,
          actionMode: input.actionMode,
          reasonCode: input.reasonCode,
          variantKey: input.variantKey,
          targetResourceType: input.targetResourceType,
          targetResourceId: input.targetResourceId,
          displaySnapshot: input.displaySnapshot as Prisma.InputJsonValue,
          ruleVersion: input.ruleVersion,
          presentedAt: input.presentedAt,
          reevaluateAt: input.reevaluateAt,
        },
      });
      return { assignment, created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const assignment = await this.client.programMissionAssignment.findUnique({
        where: {
          programEnrollmentId_sequence: {
            programEnrollmentId: enrollment.id,
            sequence: input.sequence,
          },
        },
      });
      if (
        !assignment ||
        assignment.programTemplateVersionId !== input.programTemplateVersionId ||
        assignment.routeKey !== input.routeKey ||
        assignment.phaseKey !== input.phaseKey ||
        assignment.missionDefinitionKey !== input.missionDefinitionKey ||
        assignment.actionMode !== input.actionMode ||
        assignment.reasonCode !== input.reasonCode ||
        assignment.reevaluateAt?.getTime() !== input.reevaluateAt?.getTime() ||
        assignment.variantKey !== input.variantKey
      )
        return null;
      return { assignment, created: false };
    }
  }

  async transitionAssignment(
    input: Parameters<ProgramRuntimeRepository['transitionAssignment']>[0],
  ) {
    const enrollment = await this.enrollmentAccess(input);
    if (!enrollment) return null;
    const target =
      input.transition === 'START'
        ? 'STARTED'
        : input.transition === 'COMPLETE'
          ? 'COMPLETED'
          : 'SKIPPED';
    const eventType =
      input.transition === 'START'
        ? 'MISSION_STARTED'
        : input.transition === 'COMPLETE'
          ? 'MISSION_COMPLETED'
          : 'MISSION_SKIPPED';
    const readExisting = () =>
      this.client.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
    const existing = await readExisting();
    if (existing) {
      if (
        existing.programEnrollmentId !== enrollment.id ||
        existing.missionAssignmentId !== input.assignmentId ||
        existing.eventType !== eventType
      )
        return null;
      const assignment = await this.client.programMissionAssignment.findFirst({
        where: {
          id: input.assignmentId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          status: target,
        },
      });
      return assignment ? { assignment, event: existing, created: false } : null;
    }
    try {
      return await this.client.$transaction(async (tx) => {
        const assignment = await tx.programMissionAssignment.findFirst({
          where: {
            id: input.assignmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
          },
        });
        if (!assignment || input.occurredAt < assignment.presentedAt) return null;
        const allowed =
          (input.transition === 'START' && assignment.status === 'PRESENTED') ||
          (input.transition === 'COMPLETE' && assignment.status === 'STARTED') ||
          (input.transition === 'SKIP' && ['PRESENTED', 'STARTED'].includes(assignment.status));
        if (!allowed) return null;
        const updated = await tx.programMissionAssignment.updateMany({
          where: { id: assignment.id, status: assignment.status },
          data:
            input.transition === 'START'
              ? { status: target, startedAt: input.occurredAt }
              : input.transition === 'COMPLETE'
                ? { status: target, completedAt: input.occurredAt }
                : { status: target, skippedAt: input.occurredAt },
        });
        if (updated.count !== 1) return null;
        const [updatedAssignment, event] = await Promise.all([
          tx.programMissionAssignment.findUniqueOrThrow({ where: { id: assignment.id } }),
          tx.programActionEvent.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              missionAssignmentId: assignment.id,
              eventType,
              sourceResourceType: null,
              sourceResourceId: null,
              idempotencyKey: input.idempotencyKey,
              schemaVersion: 1,
              metadata: input.metadata as Prisma.InputJsonValue,
              actorUserId: input.actorUserId,
              occurredAt: input.occurredAt,
            },
          }),
        ]);
        return { assignment: updatedAssignment, event, created: true };
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const [event, assignment] = await Promise.all([
        readExisting(),
        this.client.programMissionAssignment.findFirst({
          where: {
            id: input.assignmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            status: target,
          },
        }),
      ]);
      if (
        !event ||
        !assignment ||
        event.programEnrollmentId !== enrollment.id ||
        event.missionAssignmentId !== assignment.id ||
        event.eventType !== eventType
      )
        return null;
      return { assignment, event, created: false };
    }
  }

  async appendEvent(input: Parameters<ProgramRuntimeRepository['appendEvent']>[0]) {
    const enrollment =
      input.actorUserId === null
        ? await this.client.programEnrollment.findFirst({
            where: {
              id: input.programEnrollmentId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              status: 'ACTIVE',
            },
          })
        : await this.enrollmentAccess({ ...input, actorUserId: input.actorUserId });
    if (!enrollment) return null;
    if (input.missionAssignmentId !== null) {
      const assignment = await this.client.programMissionAssignment.findFirst({
        where: {
          id: input.missionAssignmentId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
        },
        select: { id: true },
      });
      if (!assignment) return null;
    }
    const readExisting = () =>
      this.client.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
    const existing = await readExisting();
    if (existing) {
      if (
        existing.programEnrollmentId !== enrollment.id ||
        existing.eventType !== input.eventType ||
        existing.missionAssignmentId !== input.missionAssignmentId ||
        existing.sourceResourceType !== input.sourceResourceType ||
        existing.sourceResourceId !== input.sourceResourceId ||
        existing.schemaVersion !== input.schemaVersion ||
        existing.actorUserId !== input.actorUserId
      )
        return null;
      return { event: existing, created: false };
    }
    try {
      const event = await this.client.programActionEvent.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          missionAssignmentId: input.missionAssignmentId,
          eventType: input.eventType,
          sourceResourceType: input.sourceResourceType,
          sourceResourceId: input.sourceResourceId,
          idempotencyKey: input.idempotencyKey,
          schemaVersion: input.schemaVersion,
          metadata: input.metadata as Prisma.InputJsonValue,
          actorUserId: input.actorUserId,
          occurredAt: input.occurredAt,
        },
      });
      return { event, created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const event = await readExisting();
      if (
        !event ||
        event.programEnrollmentId !== enrollment.id ||
        event.eventType !== input.eventType ||
        event.missionAssignmentId !== input.missionAssignmentId ||
        event.sourceResourceType !== input.sourceResourceType ||
        event.sourceResourceId !== input.sourceResourceId ||
        event.schemaVersion !== input.schemaVersion ||
        event.actorUserId !== input.actorUserId
      )
        return null;
      return { event, created: false };
    }
  }

  async saveProgress(input: Parameters<ProgramRuntimeRepository['saveProgress']>[0]) {
    const enrollment = await this.enrollmentAccess(input);
    if (
      !enrollment ||
      !(await this.versionMatchesEnrollment({
        ...input,
        serviceProgramId: enrollment.serviceProgramId,
      }))
    )
      return null;
    if (input.currentAssignmentId !== null) {
      const assignment = await this.client.programMissionAssignment.findFirst({
        where: {
          id: input.currentAssignmentId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          programTemplateVersionId: input.programTemplateVersionId,
        },
        select: { id: true },
      });
      if (!assignment) return null;
    }
    return this.client.programProgressSnapshot.upsert({
      where: { programEnrollmentId: enrollment.id },
      create: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: enrollment.id,
        programTemplateVersionId: input.programTemplateVersionId,
        currentAssignmentId: input.currentAssignmentId,
        routeKey: input.routeKey,
        phaseKey: input.phaseKey,
        stateKey: input.stateKey,
        bottleneckKey: input.bottleneckKey,
        completedMissionCount: input.completedMissionCount,
        ruleVersion: input.ruleVersion,
        lastActionAt: input.lastActionAt,
        nextEvaluationAt: input.nextEvaluationAt,
        calculatedAt: input.calculatedAt,
      },
      update: {
        currentAssignmentId: input.currentAssignmentId,
        routeKey: input.routeKey,
        phaseKey: input.phaseKey,
        stateKey: input.stateKey,
        bottleneckKey: input.bottleneckKey,
        completedMissionCount: input.completedMissionCount,
        revision: { increment: 1 },
        ruleVersion: input.ruleVersion,
        lastActionAt: input.lastActionAt,
        nextEvaluationAt: input.nextEvaluationAt,
        calculatedAt: input.calculatedAt,
      },
    });
  }

  async findProgress(input: Parameters<ProgramRuntimeRepository['findProgress']>[0]) {
    const enrollment = await this.enrollmentAccess(input, ['ACTIVE', 'COMPLETED', 'EXPIRED']);
    if (!enrollment) return null;
    return this.client.programProgressSnapshot.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: enrollment.id,
      },
    });
  }
}
