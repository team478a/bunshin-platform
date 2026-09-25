import type { Prisma } from './client';

export async function enqueueRegistrationCompleteEmail(
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
