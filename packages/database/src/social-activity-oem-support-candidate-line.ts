import type {
  LineConfigurationEnvironment,
  Prisma,
  PrismaClient,
  ServiceSupportAlertMode,
} from '@prisma/client';

const supportLabel: Record<ServiceSupportAlertMode, string> = {
  OPTIONAL_UPSELL: '有料オプション候補',
  INCLUDED_SUPPORT: '契約内サポート',
  INTERNAL_ESCALATION: '内部対応',
  DISABLED: 'アラート停止',
};

function handlingMode(value: Prisma.JsonValue): ServiceSupportAlertMode {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const mode = value['handlingMode'];
    if (
      mode === 'OPTIONAL_UPSELL' ||
      mode === 'INCLUDED_SUPPORT' ||
      mode === 'INTERNAL_ESCALATION' ||
      mode === 'DISABLED'
    )
      return mode;
  }
  return 'INTERNAL_ESCALATION';
}

const replace = (value: string, variables: Record<string, string>) =>
  Object.entries(variables).reduce(
    (result, [key, replacement]) => result.replaceAll(`{{${key}}}`, replacement),
    value,
  );

export async function scheduleSocialActivityOemSupportCandidateLines(
  client: PrismaClient,
  input: {
    baseUrl: string;
    environment: LineConfigurationEnvironment;
    now?: Date;
    limit?: number;
  },
) {
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const candidates = await client.socialActivityOemSupportCandidate.findMany({
    where: { status: 'OPEN' },
    orderBy: [{ detectedAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: {
      id: true,
      recommendationSnapshot: true,
      barrierCase: {
        select: {
          groupMembership: {
            select: {
              workspaceId: true,
              groupId: true,
              group: {
                select: {
                  memberships: {
                    where: {
                      status: 'ACTIVE',
                      serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
                      user: { status: 'ACTIVE' },
                    },
                    select: {
                      id: true,
                      userId: true,
                      user: { select: { displayName: true } },
                      serviceNotificationPreferences: {
                        where: { topic: 'OEM_SUPPORT_CANDIDATE', channel: 'LINE' },
                        select: { enabled: true, consentedAt: true },
                      },
                    },
                  },
                  serviceConfiguration: {
                    select: {
                      slug: true,
                      displayName: true,
                      supportAlertPolicy: { select: { notifyByLine: true } },
                      messageTemplates: {
                        where: {
                          channel: 'LINE',
                          purpose: 'OEM_SUPPORT_CANDIDATE',
                          isActive: true,
                        },
                        orderBy: { updatedAt: 'desc' },
                        take: 1,
                        select: { body: true },
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
  let scheduled = 0;
  let existing = 0;
  let skipped = 0;
  const broadcasts: Array<{
    workspaceId: string;
    broadcastId: string;
    requestedBy: string;
    scheduledAt: Date;
  }> = [];

  for (const candidate of candidates) {
    const membership = candidate.barrierCase.groupMembership;
    const service = membership.group.serviceConfiguration;
    const mode = handlingMode(candidate.recommendationSnapshot);
    if (!service || service.supportAlertPolicy?.notifyByLine !== true || mode === 'DISABLED') {
      skipped += 1;
      continue;
    }
    const preferencesExist = membership.group.memberships.some(
      ({ serviceNotificationPreferences }) => serviceNotificationPreferences.length > 0,
    );
    const recipients = membership.group.memberships.filter(({ serviceNotificationPreferences }) => {
      if (!preferencesExist) return true;
      const preference = serviceNotificationPreferences[0];
      return preference?.enabled === true && preference.consentedAt !== null;
    });
    const actor = recipients[0];
    if (!actor) {
      skipped += 1;
      continue;
    }
    const automationKey = `oem-support-candidate:${candidate.id}`;
    const manageUrl = `${input.baseUrl.replace(/\/$/, '')}/s/${encodeURIComponent(service.slug)}/manage/personalization`;
    const template =
      service.messageTemplates[0]?.body ??
      '{{serviceName}}で「{{supportType}}」の確認が必要です。\n利用者への案内や課金は自動実行されません。\n\n確認する：{{manageUrl}}';
    const variables = {
      serviceName: service.displayName,
      supportType: supportLabel[mode],
      manageUrl,
    };
    const message = replace(template, { ...variables, name: '運営担当者' });
    type ScheduledResult = {
      created: boolean;
      workspaceId: string;
      broadcastId: string;
      requestedBy: string;
      scheduledAt: Date;
    };
    let result: ScheduledResult;
    try {
      result = await client.$transaction(async (tx) => {
        const found = await tx.serviceLineBroadcast.findUnique({
          where: { automationKey },
          select: {
            id: true,
            workspaceId: true,
            updatedByUserId: true,
            scheduledAt: true,
          },
        });
        if (found)
          return {
            created: false,
            workspaceId: found.workspaceId,
            broadcastId: found.id,
            requestedBy: found.updatedByUserId,
            scheduledAt: found.scheduledAt ?? now,
          };
        const broadcast = await tx.serviceLineBroadcast.create({
          data: {
            workspaceId: membership.workspaceId,
            groupId: membership.groupId,
            title: '新しい支援候補があります',
            message,
            automationKey,
            audience: 'ACTIVE_PARTICIPANTS',
            segmentCriteria: {
              kind: 'OEM_SUPPORT_CANDIDATE',
              candidateId: candidate.id,
              handlingMode: mode,
            },
            status: 'SCHEDULED',
            scheduledAt: now,
            createdByUserId: actor.userId,
            updatedByUserId: actor.userId,
          },
          select: { id: true },
        });
        await tx.serviceLineBroadcastRecipient.createMany({
          data: recipients.map((recipient) => ({
            workspaceId: membership.workspaceId,
            groupId: membership.groupId,
            broadcastId: broadcast.id,
            groupMembershipId: recipient.id,
            userId: recipient.userId,
            message: replace(template, {
              ...variables,
              name: recipient.user.displayName || '運営担当者',
            }),
          })),
        });
        await tx.serviceLineBroadcastAuditLog.create({
          data: {
            workspaceId: membership.workspaceId,
            groupId: membership.groupId,
            broadcastId: broadcast.id,
            action: 'SCHEDULED',
            beforeData: {},
            afterData: {
              recipients: recipients.length,
              candidateId: candidate.id,
              handlingMode: mode,
              environment: input.environment,
            },
            reason: 'OEM支援候補をサービス運営管理者へ通知',
            performedByUserId: actor.userId,
          },
        });
        return {
          created: true,
          workspaceId: membership.workspaceId,
          broadcastId: broadcast.id,
          requestedBy: actor.userId,
          scheduledAt: now,
        };
      });
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002')
        throw error;
      const found = await client.serviceLineBroadcast.findUnique({
        where: { automationKey },
        select: {
          id: true,
          workspaceId: true,
          updatedByUserId: true,
          scheduledAt: true,
        },
      });
      if (!found) throw error;
      result = {
        created: false,
        workspaceId: found.workspaceId,
        broadcastId: found.id,
        requestedBy: found.updatedByUserId,
        scheduledAt: found.scheduledAt ?? now,
      };
    }
    if (result.created) scheduled += 1;
    else existing += 1;
    broadcasts.push(result);
  }
  return { selected: candidates.length, scheduled, existing, skipped, broadcasts };
}
