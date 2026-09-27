import { Prisma, type PrismaClient, type ServiceSupportAlertMode } from '@prisma/client';

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

export async function isSocialActivityOemSupportCandidateEmailDeliveryEligible(
  client: PrismaClient,
  input: {
    workspaceId: string;
    groupId: string;
    configurationId: string;
    candidateId: string;
    recipientUserId: string;
    recipientEmail: string;
  },
) {
  const candidate = await client.socialActivityOemSupportCandidate.findFirst({
    where: { id: input.candidateId, status: 'OPEN' },
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
                  memberships: {
                    where: {
                      status: 'ACTIVE',
                      serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
                      user: { status: 'ACTIVE', email: { not: null } },
                    },
                    select: {
                      userId: true,
                      user: { select: { email: true } },
                      serviceNotificationPreferences: {
                        where: { topic: 'OEM_SUPPORT_CANDIDATE', channel: 'EMAIL' },
                        select: { enabled: true },
                      },
                    },
                  },
                  serviceConfiguration: {
                    select: {
                      id: true,
                      supportAlertPolicy: { select: { notifyByEmail: true } },
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
  if (!candidate || handlingMode(candidate.recommendationSnapshot) === 'DISABLED') return false;
  const barrierCase = candidate.barrierCase;
  const service = barrierCase.groupMembership.group.serviceConfiguration;
  if (
    barrierCase.workspaceId !== input.workspaceId ||
    barrierCase.groupId !== input.groupId ||
    service?.id !== input.configurationId ||
    service.supportAlertPolicy?.notifyByEmail === false
  )
    return false;
  const managers = barrierCase.groupMembership.group.memberships;
  const recipient = managers.find(
    ({ userId, user }) => userId === input.recipientUserId && user.email === input.recipientEmail,
  );
  if (!recipient) return false;
  const preferencesExist = managers.some(
    ({ serviceNotificationPreferences }) => serviceNotificationPreferences.length > 0,
  );
  return !preferencesExist || recipient.serviceNotificationPreferences[0]?.enabled === true;
}

export async function enqueueSocialActivityOemSupportCandidateEmails(
  client: PrismaClient,
  input: { baseUrl: string; now?: Date; limit?: number },
) {
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const candidateIds = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT candidate."id"
    FROM "social_activity_oem_support_candidates" candidate
    JOIN "social_activity_barrier_cases" barrier_case
      ON barrier_case."id" = candidate."case_id"
    JOIN "service_configurations" configuration
      ON configuration."workspace_id" = barrier_case."workspace_id"
     AND configuration."group_id" = barrier_case."group_id"
    JOIN "service_registration_email_configurations" email_configuration
      ON email_configuration."workspace_id" = barrier_case."workspace_id"
     AND email_configuration."group_id" = barrier_case."group_id"
     AND email_configuration."configuration_id" = configuration."id"
     AND email_configuration."enabled" = true
     AND email_configuration."last_verified_at" IS NOT NULL
    LEFT JOIN "service_support_alert_policies" policy
      ON policy."workspace_id" = barrier_case."workspace_id"
     AND policy."group_id" = barrier_case."group_id"
    WHERE candidate."status" = 'OPEN'::"SocialActivityOemSupportCandidateStatus"
      AND COALESCE(candidate."recommendation_snapshot"->>'handlingMode', 'INTERNAL_ESCALATION') <> 'DISABLED'
      AND COALESCE(policy."notify_by_email", true) = true
      AND NOT EXISTS (
        SELECT 1
        FROM "social_activity_oem_support_candidate_email_deliveries" delivery
        WHERE delivery."candidate_id" = candidate."id"
      )
      AND EXISTS (
        SELECT 1
        FROM "group_memberships" manager
        JOIN "users" manager_user ON manager_user."id" = manager."user_id"
        WHERE manager."workspace_id" = barrier_case."workspace_id"
          AND manager."group_id" = barrier_case."group_id"
          AND manager."status" = 'ACTIVE'
          AND manager."service_role" IN ('SERVICE_OWNER', 'SERVICE_ADMIN')
          AND manager_user."status" = 'ACTIVE'
          AND manager_user."email" IS NOT NULL
      )
      AND (
        NOT EXISTS (
          SELECT 1
          FROM "service_notification_preferences" preference
          JOIN "group_memberships" manager ON manager."id" = preference."group_membership_id"
          JOIN "users" manager_user ON manager_user."id" = manager."user_id"
          WHERE manager."workspace_id" = barrier_case."workspace_id"
            AND manager."group_id" = barrier_case."group_id"
            AND manager."status" = 'ACTIVE'
            AND manager."service_role" IN ('SERVICE_OWNER', 'SERVICE_ADMIN')
            AND manager_user."status" = 'ACTIVE'
            AND manager_user."email" IS NOT NULL
            AND preference."topic" = 'OEM_SUPPORT_CANDIDATE'
            AND preference."channel" = 'EMAIL'
        )
        OR EXISTS (
          SELECT 1
          FROM "service_notification_preferences" preference
          JOIN "group_memberships" manager ON manager."id" = preference."group_membership_id"
          JOIN "users" manager_user ON manager_user."id" = manager."user_id"
          WHERE manager."workspace_id" = barrier_case."workspace_id"
            AND manager."group_id" = barrier_case."group_id"
            AND manager."status" = 'ACTIVE'
            AND manager."service_role" IN ('SERVICE_OWNER', 'SERVICE_ADMIN')
            AND manager_user."status" = 'ACTIVE'
            AND manager_user."email" IS NOT NULL
            AND preference."topic" = 'OEM_SUPPORT_CANDIDATE'
            AND preference."channel" = 'EMAIL'
            AND preference."enabled" = true
        )
      )
    ORDER BY candidate."detected_at" ASC, candidate."id" ASC
    LIMIT ${limit}
  `);
  const candidates = await client.socialActivityOemSupportCandidate.findMany({
    where: { id: { in: candidateIds.map(({ id }) => id) }, status: 'OPEN' },
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
                      user: { status: 'ACTIVE', email: { not: null } },
                    },
                    select: {
                      userId: true,
                      user: { select: { email: true, displayName: true } },
                      serviceNotificationPreferences: {
                        where: { topic: 'OEM_SUPPORT_CANDIDATE', channel: 'EMAIL' },
                        select: { enabled: true },
                      },
                    },
                  },
                  serviceConfiguration: {
                    select: {
                      id: true,
                      slug: true,
                      displayName: true,
                      registrationEmailConfiguration: true,
                      supportAlertPolicy: { select: { notifyByEmail: true } },
                      messageTemplates: {
                        where: {
                          channel: 'EMAIL',
                          purpose: 'OEM_SUPPORT_CANDIDATE',
                          isActive: true,
                        },
                        orderBy: { updatedAt: 'desc' },
                        take: 1,
                        select: { subject: true, body: true },
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
  let queued = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const membership = candidate.barrierCase.groupMembership;
    const service = membership.group.serviceConfiguration;
    const email = service?.registrationEmailConfiguration;
    const mode = handlingMode(candidate.recommendationSnapshot);
    if (
      !service ||
      service.supportAlertPolicy?.notifyByEmail === false ||
      !email?.enabled ||
      !email.lastVerifiedAt ||
      mode === 'DISABLED'
    ) {
      skipped += 1;
      continue;
    }
    const manageUrl = `${input.baseUrl.replace(/\/$/, '')}/s/${encodeURIComponent(service.slug)}/manage/personalization`;
    const template = service.messageTemplates[0];
    const hasRecipientSettings = membership.group.memberships.some(
      ({ serviceNotificationPreferences }) => serviceNotificationPreferences.length > 0,
    );
    const data = membership.group.memberships.flatMap(
      ({ userId, user, serviceNotificationPreferences }) => {
        if (hasRecipientSettings && serviceNotificationPreferences[0]?.enabled !== true) return [];
        if (!user.email) return [];
        const variables = {
          name: user.displayName || '運営担当者',
          serviceName: service.displayName,
          supportType: supportLabel[mode],
          manageUrl,
        };
        return [
          {
            workspaceId: membership.workspaceId,
            groupId: membership.groupId,
            configurationId: service.id,
            candidateId: candidate.id,
            emailConfigurationId: email.id,
            recipientUserId: userId,
            recipientEmail: user.email,
            recipientName: user.displayName,
            fromName: email.fromName,
            fromEmail: email.fromEmail,
            replyToEmail: email.replyToEmail,
            subject: replace(
              template?.subject ?? `【{{serviceName}}】新しい支援候補があります`,
              variables,
            ),
            body: replace(
              template?.body ??
                '{{name}}さん\n\n{{serviceName}}で「{{supportType}}」の確認が必要です。\n利用者への案内や課金は自動実行されません。\n\n{{manageUrl}}',
              variables,
            ),
            handlingMode: mode,
            nextAttemptAt: now,
          },
        ];
      },
    );
    if (data.length === 0) {
      skipped += 1;
      continue;
    }
    const result = await client.socialActivityOemSupportCandidateEmailDelivery.createMany({
      data,
      skipDuplicates: true,
    });
    queued += result.count;
  }
  return { selected: candidates.length, queued, skipped };
}
