import type {
  ServiceLineBroadcastDatabase,
  ServiceLineBroadcastDeliveryRecord,
  ServiceLineBroadcastRecipientRecord,
} from './service-line-broadcast-delivery-types';

function candidateId(criteria: unknown) {
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) return null;
  const value = criteria as Record<string, unknown>;
  return value.kind === 'OEM_SUPPORT_CANDIDATE' && typeof value.candidateId === 'string'
    ? value.candidateId
    : null;
}

function disabled(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  return (snapshot as Record<string, unknown>).handlingMode === 'DISABLED';
}

export async function revalidateOemSupportLineRecipients(input: {
  db: ServiceLineBroadcastDatabase;
  broadcast: ServiceLineBroadcastDeliveryRecord;
  recipients: ServiceLineBroadcastRecipientRecord[];
}) {
  const id = candidateId(input.broadcast.segmentCriteria);
  if (!id) return { applies: false, recipients: input.recipients, skipped: 0 };
  const candidate = await input.db.prisma.socialActivityOemSupportCandidate.findFirst({
    where: { id, status: 'OPEN' },
    select: {
      recommendationSnapshot: true,
      barrierCase: {
        select: {
          workspaceId: true,
          groupId: true,
          groupMembership: {
            select: {
              group: {
                select: {
                  serviceConfiguration: {
                    select: { supportAlertPolicy: { select: { notifyByLine: true } } },
                  },
                  memberships: {
                    where: {
                      status: 'ACTIVE',
                      serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
                      user: { status: 'ACTIVE' },
                    },
                    select: {
                      id: true,
                      userId: true,
                      serviceNotificationPreferences: {
                        where: { topic: 'OEM_SUPPORT_CANDIDATE', channel: 'LINE' },
                        select: { enabled: true, consentedAt: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const barrierCase = candidate?.barrierCase;
  const managers = barrierCase?.groupMembership.group.memberships ?? [];
  const policy = barrierCase?.groupMembership.group.serviceConfiguration?.supportAlertPolicy;
  const candidateEligible = Boolean(
    candidate &&
    barrierCase?.workspaceId === input.broadcast.workspaceId &&
    barrierCase.groupId === input.broadcast.groupId &&
    policy?.notifyByLine === true &&
    !disabled(candidate.recommendationSnapshot),
  );
  const preferencesExist = managers.some(
    ({ serviceNotificationPreferences }) => serviceNotificationPreferences.length > 0,
  );
  const eligibleMembershipIds = new Set(
    candidateEligible
      ? managers.flatMap((manager) => {
          const preference = manager.serviceNotificationPreferences[0];
          if (preferencesExist && (preference?.enabled !== true || preference.consentedAt === null))
            return [];
          return [manager.id];
        })
      : [],
  );
  const recipients = input.recipients.filter((recipient) =>
    eligibleMembershipIds.has(recipient.groupMembershipId),
  );
  const excludedIds = input.recipients
    .filter((recipient) => !eligibleMembershipIds.has(recipient.groupMembershipId))
    .map(({ id: recipientId }) => recipientId);
  if (excludedIds.length)
    await input.db.prisma.serviceLineBroadcastRecipient.updateMany({
      where: {
        id: { in: excludedIds },
        workspaceId: input.broadcast.workspaceId,
        groupId: input.broadcast.groupId,
        broadcastId: input.broadcast.id,
        status: 'PENDING',
      },
      data: { status: 'SKIPPED', errorCategory: 'NOTIFICATION_NO_LONGER_ELIGIBLE' },
    });
  return { applies: true, recipients, skipped: excludedIds.length };
}
