import type { ServiceParticipationRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import { enqueueRegistrationCompleteEmail } from './service-registration-email';
import { groupMembershipRecord } from './service-records';

export class PrismaServiceParticipationMembershipRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async recordUse(input: Parameters<ServiceParticipationRepository['recordUse']>[0]) {
    return this.client.$transaction(async (tx) => {
      const configuration = await tx.serviceConfiguration.findFirst({
        where: {
          slug: input.slug,
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
          ],
        },
        select: { workspaceId: true, groupId: true },
      });
      if (configuration === null) return null;
      const membership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
        },
      });
      if (membership === null) return null;

      const published = await tx.serviceLegalDocument.findMany({
        where: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          status: 'PUBLISHED',
          effectiveAt: { lte: input.now },
        },
        orderBy: [{ type: 'asc' }, { version: 'desc' }],
        select: { id: true, type: true },
      });
      const requiredIds = [
        ...new Map(published.map((document) => [document.type, document.id])).values(),
      ];
      if (requiredIds.length > 0) {
        const accepted = await tx.serviceLegalConsent.count({
          where: {
            workspaceId: configuration.workspaceId,
            groupId: configuration.groupId,
            groupMembershipId: membership.id,
            userId: input.actorUserId,
            legalDocumentId: { in: requiredIds },
          },
        });
        if (accepted !== requiredIds.length) return null;
      }

      const updated = await tx.groupMembership.update({
        where: { id: membership.id },
        data: { lastUsedAt: input.now },
      });
      const firstUse = membership.lastUsedAt === null;
      const eventKey = firstUse
        ? `${membership.id}:first-service-use`
        : `${membership.id}:service-revisited:${input.now.toISOString().slice(0, 10)}`;
      await tx.serviceMembershipEvent.createMany({
        data: [
          {
            workspaceId: configuration.workspaceId,
            groupId: configuration.groupId,
            groupMembershipId: membership.id,
            userId: input.actorUserId,
            eventType: firstUse ? 'FIRST_SERVICE_USE' : 'SERVICE_REVISITED',
            idempotencyKey: eventKey,
            occurredAt: input.now,
          },
        ],
        skipDuplicates: true,
      });
      return groupMembershipRecord(updated);
    });
  }

  async withdraw(input: Parameters<ServiceParticipationRepository['withdraw']>[0]) {
    return this.client.$transaction(async (tx) => {
      const configuration = await tx.serviceConfiguration.findUnique({
        where: { slug: input.slug },
        select: { workspaceId: true, groupId: true },
      });
      if (configuration === null) return null;
      const membership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          userId: input.actorUserId,
          role: 'PARTICIPANT',
          status: { in: ['ACTIVE', 'PENDING_APPROVAL', 'REVOKED'] },
        },
      });
      if (membership === null) return null;
      if (membership.status === 'REVOKED') return groupMembershipRecord(membership);

      const updated = await tx.groupMembership.update({
        where: { id: membership.id },
        data: { status: 'REVOKED', revokedAt: input.now },
      });
      await tx.groupMembershipAuditLog.create({
        data: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          groupMembershipId: membership.id,
          action: 'REVOKED',
          beforeData: { role: membership.role, status: membership.status },
          afterData: { role: updated.role, status: updated.status },
          reason: 'service withdrawal requested by member',
          performedByUserId: input.actorUserId,
          occurredAt: input.now,
        },
      });
      await tx.serviceMembershipEvent.createMany({
        data: [
          {
            workspaceId: configuration.workspaceId,
            groupId: configuration.groupId,
            groupMembershipId: membership.id,
            userId: input.actorUserId,
            eventType: 'SERVICE_WITHDRAWN',
            idempotencyKey: `${membership.id}:service-withdrawn`,
            occurredAt: input.now,
          },
        ],
        skipDuplicates: true,
      });
      return groupMembershipRecord(updated);
    });
  }

  async approve(input: Parameters<ServiceParticipationRepository['approve']>[0]) {
    return this.client.$transaction(async (tx) => {
      const [manager, workspaceManager, platformAdmin] = await Promise.all([
        tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.serviceId,
            userId: input.actorUserId,
            role: 'MANAGER',
            status: 'ACTIVE',
            group: { status: 'ACTIVE' },
          },
          select: { id: true },
        }),
        tx.workspaceMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            role: { in: ['OWNER', 'ADMIN'] },
            status: 'ACTIVE',
            workspace: { status: 'ACTIVE' },
          },
          select: { id: true },
        }),
        tx.platformAdmin.findFirst({
          where: {
            userId: input.actorUserId,
            role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
      ]);
      if (manager === null && workspaceManager === null && platformAdmin === null) return null;
      const target = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.serviceId,
          status: 'PENDING_APPROVAL',
        },
      });
      if (target === null) return null;
      const updated = await tx.groupMembership.update({
        where: { id: target.id },
        data: { status: 'ACTIVE' },
      });
      await tx.groupMembershipAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.serviceId,
          groupMembershipId: target.id,
          action: 'APPROVED',
          beforeData: { role: target.role, status: target.status },
          afterData: { role: updated.role, status: updated.status },
          reason: input.reason,
          performedByUserId: input.actorUserId,
          occurredAt: input.now,
        },
      });
      await tx.serviceMembershipEvent.createMany({
        data: [
          {
            workspaceId: input.workspaceId,
            groupId: input.serviceId,
            groupMembershipId: target.id,
            userId: target.userId,
            eventType: 'REGISTRATION_COMPLETED',
            idempotencyKey: `${target.id}:registration-completed`,
            occurredAt: input.now,
          },
        ],
        skipDuplicates: true,
      });
      const emailService = await tx.serviceConfiguration.findUnique({
        where: { groupId: input.serviceId },
        select: { id: true, displayName: true },
      });
      if (emailService)
        await enqueueRegistrationCompleteEmail(tx, {
          workspaceId: input.workspaceId,
          groupId: input.serviceId,
          configurationId: emailService.id,
          groupMembershipId: target.id,
          userId: target.userId,
          serviceName: emailService.displayName,
          now: input.now,
        });
      return groupMembershipRecord(updated);
    });
  }
}
