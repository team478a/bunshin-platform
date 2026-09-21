import type { ServiceParticipationRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { autoEnrollAiResaleForRegistration } from './resale-runtime';
import { Prisma, type PrismaClient, prisma } from './client';
import { groupMembershipRecord } from './service-records';
async function enqueueRegistrationCompleteEmail(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    groupId: string;
    configurationId: string;
    groupMembershipId: string;
    userId: string;
    serviceName: string;
    now: Date;
  },
) {
  const [emailConfiguration, user, template] = await Promise.all([
    tx.serviceRegistrationEmailConfiguration.findUnique({ where: { groupId: input.groupId } }),
    tx.user.findUnique({
      where: { id: input.userId },
      select: { email: true, displayName: true },
    }),
    tx.serviceMessageTemplate.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        configurationId: input.configurationId,
        channel: 'EMAIL',
        purpose: 'REGISTRATION_COMPLETE',
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
      select: { subject: true, body: true },
    }),
  ]);
  if (!emailConfiguration?.enabled || !emailConfiguration.lastVerifiedAt || !user?.email) return;
  const personalize = (value: string) =>
    value
      .replaceAll('{{name}}', user.displayName || 'ご利用者')
      .replaceAll('{{serviceName}}', input.serviceName);
  await tx.serviceRegistrationEmailDelivery.createMany({
    data: [
      {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        configurationId: input.configurationId,
        emailConfigurationId: emailConfiguration.id,
        groupMembershipId: input.groupMembershipId,
        userId: input.userId,
        recipientEmail: user.email,
        recipientName: user.displayName,
        fromName: emailConfiguration.fromName,
        fromEmail: emailConfiguration.fromEmail,
        replyToEmail: emailConfiguration.replyToEmail,
        subject: personalize(template?.subject ?? emailConfiguration.subject),
        body: personalize(template?.body ?? emailConfiguration.body),
        nextAttemptAt: input.now,
      },
    ],
    skipDuplicates: true,
  });
}

export class PrismaServiceParticipationRepository implements ServiceParticipationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findView(input: Parameters<ServiceParticipationRepository['findView']>[0]) {
    const configuration = await this.client.serviceConfiguration.findFirst({
      where: {
        slug: input.slug,
        visibility: 'PUBLIC',
        group: { status: 'ACTIVE' },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
        ],
      },
      include: { registration: true },
    });
    if (configuration?.registration === null || configuration === null) return null;
    const documents = await this.client.serviceLegalDocument.findMany({
      where: {
        workspaceId: configuration.workspaceId,
        groupId: configuration.groupId,
        status: 'PUBLISHED',
        effectiveAt: { lte: input.now },
      },
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
    });
    const legalDocuments = [
      ...new Map(documents.map((document) => [document.type, document])).values(),
    ].map(({ id, type, version, title, content }) => ({ id, type, version, title, content }));
    const membership =
      input.actorUserId === null
        ? null
        : await this.client.groupMembership.findUnique({
            where: {
              groupId_userId: {
                groupId: configuration.groupId,
                userId: input.actorUserId,
              },
            },
          });
    return {
      registrationMode: configuration.registration.mode,
      membership: membership === null ? null : groupMembershipRecord(membership),
      legalDocuments,
    };
  }

  async request(input: Parameters<ServiceParticipationRepository['request']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const configuration = await tx.serviceConfiguration.findFirst({
          where: {
            slug: input.slug,
            visibility: 'PUBLIC',
            group: { status: 'ACTIVE' },
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
            ],
          },
          include: { registration: true },
        });
        if (
          configuration?.registration === null ||
          configuration === null ||
          ['INVITATION_ONLY', 'CLOSED'].includes(configuration.registration.mode)
        )
          return null;

        const published = await tx.serviceLegalDocument.findMany({
          where: {
            workspaceId: configuration.workspaceId,
            groupId: configuration.groupId,
            type: { in: ['TERMS', 'PRIVACY'] },
            status: 'PUBLISHED',
            effectiveAt: { lte: input.now },
          },
          orderBy: [{ type: 'asc' }, { version: 'desc' }],
        });
        const latest = [
          ...new Map(published.map((document) => [document.type, document])).values(),
        ];
        const requiredIds = latest.map(({ id }) => id).sort();
        if (requiredIds.join(':') !== [...input.legalDocumentIds].sort().join(':')) return null;

        const workspaceMembership = await tx.workspaceMembership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: configuration.workspaceId,
              userId: input.actorUserId,
            },
          },
        });
        if (workspaceMembership !== null && workspaceMembership.status !== 'ACTIVE') return null;
        if (workspaceMembership === null)
          await tx.workspaceMembership.create({
            data: {
              workspaceId: configuration.workspaceId,
              userId: input.actorUserId,
              role: 'MEMBER',
            },
          });

        const existing = await tx.groupMembership.findUnique({
          where: {
            groupId_userId: { groupId: configuration.groupId, userId: input.actorUserId },
          },
        });
        if (existing !== null && existing.role !== 'PARTICIPANT') return null;
        if (
          existing !== null &&
          !['ACTIVE', 'PENDING_APPROVAL', 'DECLINED', 'REVOKED'].includes(existing.status)
        )
          return null;
        const needsParticipantSeat =
          existing === null || !['ACTIVE', 'PENDING_APPROVAL'].includes(existing.status);
        if (needsParticipantSeat) {
          const commercial = await tx.serviceCommercialSetting.findFirst({
            where: {
              workspaceId: configuration.workspaceId,
              groupId: configuration.groupId,
              status: 'ACTIVE',
              OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
            },
            select: { includedMemberLimit: true },
          });
          if (commercial?.includedMemberLimit) {
            await tx.$queryRaw(
              Prisma.sql`SELECT "id" FROM "service_configurations" WHERE "id" = ${configuration.id}::uuid FOR UPDATE`,
            );
            const members = await tx.groupMembership.count({
              where: {
                workspaceId: configuration.workspaceId,
                groupId: configuration.groupId,
                role: 'PARTICIPANT',
                status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
              },
            });
            if (members >= commercial.includedMemberLimit) {
              throw new ApplicationError('FORBIDDEN', 'このサービスは定員に達しました');
            }
          }
        }
        const status = configuration.registration.mode === 'PUBLIC' ? 'ACTIVE' : 'PENDING_APPROVAL';
        const membership = await tx.groupMembership.upsert({
          where: {
            groupId_userId: { groupId: configuration.groupId, userId: input.actorUserId },
          },
          create: {
            workspaceId: configuration.workspaceId,
            groupId: configuration.groupId,
            userId: input.actorUserId,
            role: 'PARTICIPANT',
            status,
            consentedAt: input.now,
          },
          update: { status, consentedAt: input.now, declinedAt: null, revokedAt: null },
        });
        if (configuration.registration.referralEnabled && input.referralCode !== null) {
          const referralCode = await tx.serviceReferralCode.findFirst({
            where: {
              workspaceId: configuration.workspaceId,
              groupId: configuration.groupId,
              code: input.referralCode,
              status: 'ACTIVE',
              groupMembership: { status: 'ACTIVE' },
            },
            select: { id: true, groupMembershipId: true, userId: true },
          });
          if (
            referralCode !== null &&
            referralCode.groupMembershipId !== membership.id &&
            referralCode.userId !== input.actorUserId
          ) {
            const existingReferral = await tx.serviceReferral.findFirst({
              where: {
                workspaceId: configuration.workspaceId,
                groupId: configuration.groupId,
                referredMembershipId: membership.id,
              },
              select: { id: true },
            });
            if (existingReferral === null) {
              const click =
                input.referralClickId === null
                  ? null
                  : await tx.serviceReferralClick.findFirst({
                      where: {
                        id: input.referralClickId,
                        workspaceId: configuration.workspaceId,
                        groupId: configuration.groupId,
                        referralCodeId: referralCode.id,
                        expiresAt: { gt: input.now },
                      },
                      select: { id: true },
                    });
              const referralClick =
                click ??
                (await tx.serviceReferralClick.create({
                  data: {
                    workspaceId: configuration.workspaceId,
                    groupId: configuration.groupId,
                    referralCodeId: referralCode.id,
                    expiresAt: new Date(input.now.getTime() + 30 * 24 * 60 * 60 * 1000),
                  },
                  select: { id: true },
                }));
              await tx.serviceReferral.createMany({
                data: [
                  {
                    workspaceId: configuration.workspaceId,
                    groupId: configuration.groupId,
                    referralCodeId: referralCode.id,
                    referralClickId: referralClick.id,
                    referredMembershipId: membership.id,
                    referredUserId: input.actorUserId,
                    status: 'REGISTERED',
                    registeredAt: input.now,
                  },
                ],
                skipDuplicates: true,
              });
            }
          }
        }
        if (latest.length > 0)
          await tx.serviceLegalConsent.createMany({
            data: latest.map(({ id }) => ({
              workspaceId: configuration.workspaceId,
              groupId: configuration.groupId,
              groupMembershipId: membership.id,
              userId: input.actorUserId,
              legalDocumentId: id,
              consentedAt: input.now,
            })),
            skipDuplicates: true,
          });
        await tx.groupMembershipAuditLog.create({
          data: {
            workspaceId: configuration.workspaceId,
            groupId: configuration.groupId,
            groupMembershipId: membership.id,
            action: status === 'ACTIVE' ? 'APPROVED' : 'REQUESTED',
            beforeData: existing === null ? {} : { status: existing.status },
            afterData: { role: membership.role, status: membership.status },
            reason:
              status === 'ACTIVE'
                ? 'public service registration'
                : 'service participation requested',
            performedByUserId: input.actorUserId,
            occurredAt: input.now,
          },
        });
        if (status === 'ACTIVE')
          await tx.serviceMembershipEvent.createMany({
            data: [
              {
                workspaceId: configuration.workspaceId,
                groupId: configuration.groupId,
                groupMembershipId: membership.id,
                userId: input.actorUserId,
                eventType: 'REGISTRATION_COMPLETED',
                idempotencyKey: `${membership.id}:registration-completed`,
                occurredAt: input.now,
              },
            ],
            skipDuplicates: true,
          });
        if (status === 'ACTIVE') {
          await enqueueRegistrationCompleteEmail(tx, {
            workspaceId: configuration.workspaceId,
            groupId: configuration.groupId,
            configurationId: configuration.id,
            groupMembershipId: membership.id,
            userId: input.actorUserId,
            serviceName: configuration.displayName,
            now: input.now,
          });
          await autoEnrollAiResaleForRegistration(tx, { membership, now: input.now });
        }
        return groupMembershipRecord(membership);
      },
      { isolationLevel: 'Serializable' },
    );
  }

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
