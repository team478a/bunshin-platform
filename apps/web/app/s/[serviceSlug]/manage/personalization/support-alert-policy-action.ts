'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';

const schema = z.object({
  serviceSlug: z.string().min(1).max(80),
  mode: z.enum(['OPTIONAL_UPSELL', 'INCLUDED_SUPPORT', 'INTERNAL_ESCALATION', 'DISABLED']),
  channelMode: z.enum(['EMAIL', 'LINE', 'BOTH', 'DASHBOARD']),
});

export async function updateSupportAlertPolicyAction(form: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) return;
  const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId).catch(
    () => null,
  );
  if (!service) return;
  const db = await import('@bunshin/database');
  await db.prisma.$transaction(async (tx) => {
    const before = await tx.serviceSupportAlertPolicy.findUnique({
      where: { groupId: service.serviceId },
      select: { mode: true, notifyByEmail: true, notifyByLine: true },
    });
    const notifyByEmail = parsed.data.channelMode === 'EMAIL' || parsed.data.channelMode === 'BOTH';
    const notifyByLine = parsed.data.channelMode === 'LINE' || parsed.data.channelMode === 'BOTH';
    await tx.serviceSupportAlertPolicy.upsert({
      where: { groupId: service.serviceId },
      create: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: service.configuration.id,
        mode: parsed.data.mode,
        notifyByEmail,
        notifyByLine,
        updatedByUserId: actor.userId,
      },
      update: {
        mode: parsed.data.mode,
        notifyByEmail,
        notifyByLine,
        updatedByUserId: actor.userId,
      },
    });
    await tx.serviceConfigurationAudit.create({
      data: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: service.configuration.id,
        action: 'SUPPORT_ALERT_POLICY_UPDATED',
        beforeData: {
          mode: before?.mode ?? 'INTERNAL_ESCALATION',
          notifyByEmail: before?.notifyByEmail ?? true,
          notifyByLine: before?.notifyByLine ?? false,
        },
        afterData: { mode: parsed.data.mode, notifyByEmail, notifyByLine },
        reason: 'OEM支援アラートの扱いを更新',
        performedByUserId: actor.userId,
      },
    });
  });
  revalidatePath(`/s/${parsed.data.serviceSlug}/manage/personalization`);
}
