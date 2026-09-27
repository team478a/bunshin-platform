'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';

const schema = z.object({
  serviceSlug: z.string().min(1).max(80),
  channel: z.enum(['EMAIL', 'LINE']),
});

export async function updateOemSupportRecipientsAction(form: FormData) {
  const parsed = schema.safeParse({
    serviceSlug: form.get('serviceSlug'),
    channel: form.get('channel'),
  });
  if (!parsed.success) return;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) return;
  const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId).catch(
    () => null,
  );
  if (!service) return;
  const selected = new Set(
    form
      .getAll('recipientUserId')
      .filter((value): value is string => typeof value === 'string')
      .filter((value) => z.string().uuid().safeParse(value).success),
  );
  const db = await import('@bunshin/database');
  await db.prisma.$transaction(async (tx) => {
    const managers = await tx.groupMembership.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
        serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
      },
      select: { id: true, userId: true },
    });
    for (const manager of managers) {
      const enabled = selected.has(manager.userId);
      await tx.serviceNotificationPreference.upsert({
        where: {
          workspaceId_groupId_groupMembershipId_topic_channel: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            groupMembershipId: manager.id,
            topic: 'OEM_SUPPORT_CANDIDATE',
            channel: parsed.data.channel,
          },
        },
        create: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          groupMembershipId: manager.id,
          userId: manager.userId,
          topic: 'OEM_SUPPORT_CANDIDATE',
          channel: parsed.data.channel,
          enabled,
          consentedAt: enabled ? new Date() : null,
          optedOutAt: enabled ? null : new Date(),
        },
        update: {
          enabled,
          consentedAt: enabled ? new Date() : null,
          optedOutAt: enabled ? null : new Date(),
        },
      });
    }
    await tx.serviceConfigurationAudit.create({
      data: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: service.configuration.id,
        action: `OEM_SUPPORT_${parsed.data.channel}_RECIPIENTS_UPDATED`,
        beforeData: {},
        afterData: {
          channel: parsed.data.channel,
          recipientUserIds: managers
            .filter((item) => selected.has(item.userId))
            .map((item) => item.userId),
        },
        reason: `OEM支援候補${parsed.data.channel === 'EMAIL' ? 'メール' : 'LINE'}の通知担当者を更新`,
        performedByUserId: actor.userId,
      },
    });
  });
  revalidatePath(`/s/${parsed.data.serviceSlug}/manage/personalization`);
}
