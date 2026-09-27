'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';

const schema = z.object({
  serviceSlug: z.string().min(1).max(80),
  mode: z.enum(['OPTIONAL_UPSELL', 'INCLUDED_SUPPORT', 'INTERNAL_ESCALATION', 'DISABLED']),
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
      select: { mode: true },
    });
    await tx.serviceSupportAlertPolicy.upsert({
      where: { groupId: service.serviceId },
      create: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: service.configuration.id,
        mode: parsed.data.mode,
        updatedByUserId: actor.userId,
      },
      update: { mode: parsed.data.mode, updatedByUserId: actor.userId },
    });
    await tx.serviceConfigurationAudit.create({
      data: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: service.configuration.id,
        action: 'SUPPORT_ALERT_POLICY_UPDATED',
        beforeData: { mode: before?.mode ?? 'INTERNAL_ESCALATION' },
        afterData: { mode: parsed.data.mode },
        reason: 'OEM支援アラートの扱いを更新',
        performedByUserId: actor.userId,
      },
    });
  });
  revalidatePath(`/s/${parsed.data.serviceSlug}/manage/personalization`);
}
