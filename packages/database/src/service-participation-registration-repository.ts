import type { ServiceParticipationRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { autoEnrollAiResaleForRegistration } from './resale-runtime';
import { Prisma, type PrismaClient, prisma } from './client';
import { enqueueRegistrationCompleteEmail } from './service-registration-email';
import { groupMembershipRecord } from './service-records';

export class PrismaServiceParticipationRegistrationRepository {
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
}
