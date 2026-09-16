import type {
  ServiceNotificationPreference,
  ServiceNotificationPreferenceRepository,
} from '@bunshin/application';
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

const view = (row: {
  id: string;
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  userId: string;
  topic: string;
  channel: 'LINE' | 'EMAIL';
  enabled: boolean;
  consentedAt: Date | null;
  optedOutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ServiceNotificationPreference => ({ ...row });

async function activeMembership(db: Db, input: { slug: string; actorUserId: string; now: Date }) {
  const configuration = await db.serviceConfiguration.findFirst({
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
  const membership = await db.groupMembership.findFirst({
    where: {
      workspaceId: configuration.workspaceId,
      groupId: configuration.groupId,
      userId: input.actorUserId,
      status: 'ACTIVE',
      consentedAt: { not: null },
    },
    select: { id: true, userId: true },
  });
  if (membership === null) return null;
  const documents = await db.serviceLegalDocument.findMany({
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
    ...new Map(documents.map((document) => [document.type, document.id])).values(),
  ];
  if (requiredIds.length > 0) {
    const accepted = await db.serviceLegalConsent.count({
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
  return { ...configuration, membershipId: membership.id, userId: membership.userId };
}

export class PrismaServiceNotificationPreferenceRepository implements ServiceNotificationPreferenceRepository {
  constructor(private readonly client: PrismaClient) {}

  async get(input: Parameters<ServiceNotificationPreferenceRepository['get']>[0]) {
    const membership = await activeMembership(this.client, input);
    if (membership === null) return { accessible: false, preference: null };
    const preference = await this.client.serviceNotificationPreference.findUnique({
      where: {
        workspaceId_groupId_groupMembershipId_topic_channel: {
          workspaceId: membership.workspaceId,
          groupId: membership.groupId,
          groupMembershipId: membership.membershipId,
          topic: input.topic,
          channel: input.channel,
        },
      },
    });
    return { accessible: true, preference: preference === null ? null : view(preference) };
  }

  async upsert(input: Parameters<ServiceNotificationPreferenceRepository['upsert']>[0]) {
    return this.client.$transaction(async (tx) => {
      const membership = await activeMembership(tx, input);
      if (membership === null) return null;
      const key = {
        workspaceId: membership.workspaceId,
        groupId: membership.groupId,
        groupMembershipId: membership.membershipId,
        topic: input.topic,
        channel: input.channel,
      };
      const existing = await tx.serviceNotificationPreference.findUnique({
        where: { workspaceId_groupId_groupMembershipId_topic_channel: key },
      });
      if (existing?.enabled === input.enabled) return view(existing);

      const preference = await tx.serviceNotificationPreference.upsert({
        where: { workspaceId_groupId_groupMembershipId_topic_channel: key },
        create: {
          ...key,
          userId: membership.userId,
          enabled: input.enabled,
          consentedAt: input.enabled ? input.now : null,
          optedOutAt: input.enabled ? null : input.now,
        },
        update: {
          enabled: input.enabled,
          consentedAt: input.enabled ? input.now : null,
          optedOutAt: input.enabled ? null : input.now,
        },
      });
      if (input.enabled || existing !== null) {
        const previousRevision = existing?.updatedAt.toISOString() ?? 'new';
        await tx.serviceMembershipEvent.create({
          data: {
            workspaceId: membership.workspaceId,
            groupId: membership.groupId,
            groupMembershipId: membership.membershipId,
            userId: membership.userId,
            eventType: input.enabled ? 'NOTIFICATION_OPTED_IN' : 'NOTIFICATION_OPTED_OUT',
            topic: input.topic,
            channel: input.channel,
            idempotencyKey: [
              membership.membershipId,
              input.topic,
              input.channel,
              input.enabled ? 'in' : 'out',
              previousRevision,
            ].join(':'),
            occurredAt: input.now,
          },
        });
      }
      return view(preference);
    });
  }
}
