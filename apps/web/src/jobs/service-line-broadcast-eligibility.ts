import { FORTUNE_WEEKLY_NOTIFICATION_TOPIC } from '@bunshin/capability-fortune';
import type { LineConfigurationEnvironment } from '@bunshin/application';
import type {
  ServiceLineBroadcastConfiguration,
  ServiceLineBroadcastDatabase,
  ServiceLineBroadcastDeliveryRecord,
  ServiceLineBroadcastRecipientRecord,
} from './service-line-broadcast-delivery-types';

export async function resolveServiceLineBroadcastRecipientIds(input: {
  db: ServiceLineBroadcastDatabase;
  broadcast: ServiceLineBroadcastDeliveryRecord;
  configuration: ServiceLineBroadcastConfiguration;
  environment: LineConfigurationEnvironment;
  mode: 'SHARED' | 'DEDICATED';
  recipients: ServiceLineBroadcastRecipientRecord[];
  now?: Date;
}) {
  const membershipIds = input.recipients.map((recipient) => recipient.groupMembershipId);
  const memberships = await input.db.prisma.groupMembership.findMany({
    where: {
      workspaceId: input.broadcast.workspaceId,
      groupId: input.broadcast.groupId,
      id: { in: membershipIds },
      status: 'ACTIVE',
      consentedAt: { not: null },
      user: { status: 'ACTIVE' },
    },
    select: { id: true },
  });
  const eligibleMembershipIds = new Set(memberships.map((item) => item.id));
  const criteria = input.broadcast.segmentCriteria as {
    kind?: unknown;
    programEnrollmentId?: unknown;
    assignmentId?: unknown;
    offeringId?: unknown;
  };

  if (criteria.kind === 'FORTUNE_WEEKLY') {
    const preferences = await input.db.prisma.serviceNotificationPreference.findMany({
      where: {
        workspaceId: input.broadcast.workspaceId,
        groupId: input.broadcast.groupId,
        groupMembershipId: { in: membershipIds },
        topic: FORTUNE_WEEKLY_NOTIFICATION_TOPIC,
        channel: 'LINE',
        enabled: true,
        consentedAt: { not: null },
        optedOutAt: null,
      },
      select: { groupMembershipId: true },
    });
    const consented = new Set(preferences.map((item) => item.groupMembershipId));
    for (const membershipId of eligibleMembershipIds)
      if (!consented.has(membershipId)) eligibleMembershipIds.delete(membershipId);
  }

  if (criteria.kind === 'AI_RESALE_ACTION' || criteria.kind === 'AI_TRAINING_ACTION') {
    if (
      typeof criteria.programEnrollmentId !== 'string' ||
      typeof criteria.assignmentId !== 'string'
    ) {
      eligibleMembershipIds.clear();
    } else {
      const [enrollment, progress, assignment] = await Promise.all([
        input.db.prisma.programEnrollment.findFirst({
          where: {
            id: criteria.programEnrollmentId,
            workspaceId: input.broadcast.workspaceId,
            groupId: input.broadcast.groupId,
            status: 'ACTIVE',
          },
          select: { id: true, groupMembershipId: true, serviceProgramId: true },
        }),
        input.db.prisma.programProgressSnapshot.findFirst({
          where: {
            workspaceId: input.broadcast.workspaceId,
            groupId: input.broadcast.groupId,
            programEnrollmentId: criteria.programEnrollmentId,
            currentAssignmentId: criteria.assignmentId,
          },
          select: { id: true },
        }),
        input.db.prisma.programMissionAssignment.findFirst({
          where: {
            id: criteria.assignmentId,
            workspaceId: input.broadcast.workspaceId,
            groupId: input.broadcast.groupId,
            programEnrollmentId: criteria.programEnrollmentId,
            status: 'PRESENTED',
          },
          select: { id: true },
        }),
      ]);
      const expectedModuleFilter =
        criteria.kind === 'AI_TRAINING_ACTION'
          ? { path: ['moduleKey'], equals: 'AI_TRAINING_V1' }
          : { path: ['moduleKey'], equals: 'AI_RESALE_V1' };
      const program = enrollment
        ? await input.db.prisma.serviceProgram.findFirst({
            where: {
              id: enrollment.serviceProgramId,
              workspaceId: input.broadcast.workspaceId,
              groupId: input.broadcast.groupId,
              status: 'ACTIVE',
              settings: expectedModuleFilter,
            },
            select: { id: true },
          })
        : null;
      for (const membershipId of eligibleMembershipIds) {
        if (
          !enrollment ||
          enrollment.groupMembershipId !== membershipId ||
          !progress ||
          !assignment ||
          !program
        )
          eligibleMembershipIds.delete(membershipId);
      }
    }
  }

  if (criteria.kind === 'AI_RESALE_OFFER') {
    if (
      typeof criteria.programEnrollmentId !== 'string' ||
      typeof criteria.offeringId !== 'string'
    ) {
      eligibleMembershipIds.clear();
    } else {
      const offers = new input.db.PrismaAiResaleOfferRepository(input.db.prisma);
      for (const membershipId of [...eligibleMembershipIds]) {
        const recipient = input.recipients.find((item) => item.groupMembershipId === membershipId);
        const [state, alreadyShown] = recipient
          ? await Promise.all([
              offers.findState({
                workspaceId: input.broadcast.workspaceId,
                groupId: input.broadcast.groupId,
                actorUserId: recipient.userId,
                freeEnrollmentId: criteria.programEnrollmentId,
                now: input.now ?? new Date(),
              }),
              input.db.prisma.programActionEvent.findFirst({
                where: {
                  workspaceId: input.broadcast.workspaceId,
                  groupId: input.broadcast.groupId,
                  programEnrollmentId: criteria.programEnrollmentId,
                  eventType: 'STANDARD_OFFER_SHOWN',
                },
                select: { id: true },
              }),
            ])
          : [null, null];
        if (
          state?.status !== 'STANDARD' ||
          state.offer?.offeringId !== criteria.offeringId ||
          alreadyShown
        )
          eligibleMembershipIds.delete(membershipId);
      }
    }
  }

  const recipientIds = new Map<string, string>();
  if (input.mode === 'DEDICATED') {
    const connections = await input.db.prisma.groupLineConnection.findMany({
      where: {
        workspaceId: input.broadcast.workspaceId,
        groupId: input.broadcast.groupId,
        configurationId: input.configuration.id,
        groupMembershipId: { in: [...eligibleMembershipIds] },
        status: 'ACTIVE',
        notificationConsentAt: { not: null },
        friendshipStatus: 'FOLLOWING',
      },
      select: { groupMembershipId: true, providerUserId: true },
    });
    for (const item of connections) recipientIds.set(item.groupMembershipId, item.providerUserId);
  } else {
    const connections = await input.db.prisma.lineConnection.findMany({
      where: {
        environment: input.environment,
        workspaceId: input.broadcast.workspaceId,
        userId: { in: input.recipients.map((recipient) => recipient.userId) },
        status: 'ACTIVE',
        notificationConsentAt: { not: null },
        friendshipStatus: 'FOLLOWING',
      },
      select: { userId: true, providerUserId: true },
    });
    const byUser = new Map(connections.map((item) => [item.userId, item.providerUserId]));
    for (const recipient of input.recipients) {
      const providerUserId = byUser.get(recipient.userId);
      if (providerUserId && eligibleMembershipIds.has(recipient.groupMembershipId))
        recipientIds.set(recipient.groupMembershipId, providerUserId);
    }
  }
  return recipientIds;
}
