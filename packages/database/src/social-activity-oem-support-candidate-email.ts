import type { Prisma, PrismaClient, ServiceSupportAlertMode } from '@prisma/client';

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

export async function enqueueSocialActivityOemSupportCandidateEmails(
  client: PrismaClient,
  input: { baseUrl: string; now?: Date; limit?: number },
) {
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const candidates = await client.socialActivityOemSupportCandidate.findMany({
    where: { status: 'OPEN', emailDeliveries: { none: {} } },
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
                    },
                  },
                  serviceConfiguration: {
                    select: {
                      id: true,
                      slug: true,
                      displayName: true,
                      registrationEmailConfiguration: true,
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
    if (!service || !email?.enabled || !email.lastVerifiedAt || mode === 'DISABLED') {
      skipped += 1;
      continue;
    }
    const manageUrl = `${input.baseUrl.replace(/\/$/, '')}/s/${encodeURIComponent(service.slug)}/manage/personalization`;
    const template = service.messageTemplates[0];
    const data = membership.group.memberships.flatMap(({ userId, user }) => {
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
    });
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
