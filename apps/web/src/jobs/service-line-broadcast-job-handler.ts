import 'server-only';
import type { ServiceLineBroadcastJobHandler } from '@bunshin/application';
import { FORTUNE_WEEKLY_NOTIFICATION_TOPIC } from '@bunshin/capability-fortune';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from '../line/secure-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';

export function createServiceLineBroadcastJobHandler(): ServiceLineBroadcastJobHandler {
  return {
    async execute({ job, broadcastId }) {
      const db = await import('@bunshin/database');
      const broadcast = await db.prisma.serviceLineBroadcast.findFirst({
        where: {
          id: broadcastId,
          workspaceId: job.workspaceId,
          status: 'SCHEDULED',
        },
      });
      if (!broadcast) return { retryable: false };
      const environment = currentLineEnvironment();
      const policy = await db.prisma.groupLineRoutingPolicy.findUnique({
        where: {
          workspaceId_groupId_environment: {
            workspaceId: broadcast.workspaceId,
            groupId: broadcast.groupId,
            environment,
          },
        },
        select: { mode: true, pilotEnabled: true },
      });
      const mode = policy?.mode ?? 'SHARED';
      if (mode === 'DISABLED' || (mode === 'DEDICATED' && !policy?.pilotEnabled)) {
        await db.prisma.serviceLineBroadcastRecipient.updateMany({
          where: { broadcastId: broadcast.id, status: 'PENDING' },
          data: { status: 'SKIPPED', errorCategory: 'LINE_DELIVERY_DISABLED' },
        });
        await db.prisma.serviceLineBroadcast.update({
          where: { id: broadcast.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        return { retryable: false };
      }
      const configuration =
        mode === 'DEDICATED'
          ? await db.prisma.groupLineChannelConfiguration.findFirst({
              where: {
                workspaceId: broadcast.workspaceId,
                groupId: broadcast.groupId,
                environment,
                status: 'ACTIVE',
                lastVerifiedAt: { not: null },
                lastErrorCategory: null,
                globallyPaused: false,
              },
              select: { id: true, encryptedAccessToken: true },
            })
          : await db.prisma.lineChannelConfiguration.findFirst({
              where: {
                environment,
                status: 'ACTIVE',
                lastVerifiedAt: { not: null },
                lastErrorCategory: null,
                globallyPaused: false,
              },
              select: { id: true, encryptedAccessToken: true },
            });
      if (!configuration) return { retryable: true, category: 'LINE_CONFIGURATION_UNAVAILABLE' };
      const recipients = await db.prisma.serviceLineBroadcastRecipient.findMany({
        where: {
          workspaceId: broadcast.workspaceId,
          groupId: broadcast.groupId,
          broadcastId: broadcast.id,
          status: 'PENDING',
        },
        select: { id: true, groupMembershipId: true, userId: true, message: true },
        take: 500,
      });
      const memberships = await db.prisma.groupMembership.findMany({
        where: {
          workspaceId: broadcast.workspaceId,
          groupId: broadcast.groupId,
          id: { in: recipients.map((recipient) => recipient.groupMembershipId) },
          status: 'ACTIVE',
          consentedAt: { not: null },
          user: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
      const eligibleMembershipIds = new Set(memberships.map((item) => item.id));
      const criteria = broadcast.segmentCriteria as {
        kind?: unknown;
        programEnrollmentId?: unknown;
        assignmentId?: unknown;
        offeringId?: unknown;
      };
      if (criteria.kind === 'FORTUNE_WEEKLY') {
        const preferences = await db.prisma.serviceNotificationPreference.findMany({
          where: {
            workspaceId: broadcast.workspaceId,
            groupId: broadcast.groupId,
            groupMembershipId: { in: recipients.map((item) => item.groupMembershipId) },
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
      if (criteria.kind === 'AI_RESALE_ACTION') {
        if (
          typeof criteria.programEnrollmentId !== 'string' ||
          typeof criteria.assignmentId !== 'string'
        ) {
          eligibleMembershipIds.clear();
        } else {
          const [enrollment, progress, assignment] = await Promise.all([
            db.prisma.programEnrollment.findFirst({
              where: {
                id: criteria.programEnrollmentId,
                workspaceId: broadcast.workspaceId,
                groupId: broadcast.groupId,
                status: 'ACTIVE',
              },
              select: { id: true, groupMembershipId: true, serviceProgramId: true },
            }),
            db.prisma.programProgressSnapshot.findFirst({
              where: {
                workspaceId: broadcast.workspaceId,
                groupId: broadcast.groupId,
                programEnrollmentId: criteria.programEnrollmentId,
                currentAssignmentId: criteria.assignmentId,
              },
              select: { id: true },
            }),
            db.prisma.programMissionAssignment.findFirst({
              where: {
                id: criteria.assignmentId,
                workspaceId: broadcast.workspaceId,
                groupId: broadcast.groupId,
                programEnrollmentId: criteria.programEnrollmentId,
                status: 'PRESENTED',
              },
              select: { id: true },
            }),
          ]);
          const program = enrollment
            ? await db.prisma.serviceProgram.findFirst({
                where: {
                  id: enrollment.serviceProgramId,
                  workspaceId: broadcast.workspaceId,
                  groupId: broadcast.groupId,
                  status: 'ACTIVE',
                  settings: { path: ['moduleKey'], equals: 'AI_RESALE_V1' },
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
            ) {
              eligibleMembershipIds.delete(membershipId);
            }
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
          const offers = new db.PrismaAiResaleOfferRepository(db.prisma);
          for (const membershipId of [...eligibleMembershipIds]) {
            const recipient = recipients.find((item) => item.groupMembershipId === membershipId);
            const [state, alreadyShown] = recipient
              ? await Promise.all([
                  offers.findState({
                    workspaceId: broadcast.workspaceId,
                    groupId: broadcast.groupId,
                    actorUserId: recipient.userId,
                    freeEnrollmentId: criteria.programEnrollmentId,
                    now: new Date(),
                  }),
                  db.prisma.programActionEvent.findFirst({
                    where: {
                      workspaceId: broadcast.workspaceId,
                      groupId: broadcast.groupId,
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
            ) {
              eligibleMembershipIds.delete(membershipId);
            }
          }
        }
      }
      const recipientIds = new Map<string, string>();
      if (mode === 'DEDICATED') {
        const connections = await db.prisma.groupLineConnection.findMany({
          where: {
            workspaceId: broadcast.workspaceId,
            groupId: broadcast.groupId,
            configurationId: configuration.id,
            groupMembershipId: { in: [...eligibleMembershipIds] },
            status: 'ACTIVE',
            notificationConsentAt: { not: null },
            friendshipStatus: 'FOLLOWING',
          },
          select: { groupMembershipId: true, providerUserId: true },
        });
        for (const item of connections)
          recipientIds.set(item.groupMembershipId, item.providerUserId);
      } else {
        const connections = await db.prisma.lineConnection.findMany({
          where: {
            environment,
            workspaceId: broadcast.workspaceId,
            userId: { in: recipients.map((recipient) => recipient.userId) },
            status: 'ACTIVE',
            notificationConsentAt: { not: null },
            friendshipStatus: 'FOLLOWING',
          },
          select: { userId: true, providerUserId: true },
        });
        const byUser = new Map(connections.map((item) => [item.userId, item.providerUserId]));
        for (const recipient of recipients) {
          const providerUserId = byUser.get(recipient.userId);
          if (providerUserId && eligibleMembershipIds.has(recipient.groupMembershipId))
            recipientIds.set(recipient.groupMembershipId, providerUserId);
        }
      }
      const provider = new LineMessagingApiAdapter();
      const token = new AesGcmLineSecretCrypto().decrypt(configuration.encryptedAccessToken);
      let failed = 0;
      for (const recipient of recipients) {
        const providerUserId = recipientIds.get(recipient.groupMembershipId);
        if (!providerUserId) {
          await db.prisma.serviceLineBroadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: 'SKIPPED', errorCategory: 'RECIPIENT_NOT_ELIGIBLE' },
          });
          continue;
        }
        const outcome = await provider.pushText({
          accessToken: token,
          recipientId: providerUserId,
          text: recipient.message ?? broadcast.message,
        });
        if (outcome.ok) {
          await db.prisma.serviceLineBroadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: 'SENT', deliveredAt: new Date(), errorCategory: null },
          });
        } else {
          failed += 1;
          await db.prisma.serviceLineBroadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: 'FAILED', errorCategory: outcome.category },
          });
        }
      }
      const pending = await db.prisma.serviceLineBroadcastRecipient.count({
        where: { broadcastId: broadcast.id, status: 'PENDING' },
      });
      if (pending > 0) return { retryable: true, category: 'BROADCAST_BATCH_REMAINING' };
      await db.prisma.serviceLineBroadcast.update({
        where: { id: broadcast.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await db.prisma.serviceLineBroadcastAuditLog.create({
        data: {
          workspaceId: broadcast.workspaceId,
          groupId: broadcast.groupId,
          broadcastId: broadcast.id,
          action: 'DELIVERY_COMPLETED',
          beforeData: {},
          afterData: { processed: recipients.length, failed },
          reason: '予約または即時配信を実行',
          performedByUserId: broadcast.updatedByUserId,
        },
      });
      return { retryable: false };
    },
  };
}
