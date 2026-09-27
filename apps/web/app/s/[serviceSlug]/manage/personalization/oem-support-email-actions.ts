'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';

const schema = z.object({
  serviceSlug: z.string().min(1).max(80),
  deliveryId: z.string().uuid(),
});

export async function retryOemSupportCandidateEmailAction(form: FormData) {
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
    const delivery = await tx.socialActivityOemSupportCandidateEmailDelivery.findFirst({
      where: {
        id: parsed.data.deliveryId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: service.configuration.id,
        status: 'FAILED',
      },
      select: { id: true, candidateId: true, attemptCount: true, lastErrorCategory: true },
    });
    if (!delivery) return;
    const updated = await tx.socialActivityOemSupportCandidateEmailDelivery.updateMany({
      where: { id: delivery.id, status: 'FAILED', attemptCount: delivery.attemptCount },
      data: {
        status: 'PENDING',
        attemptCount: 0,
        nextAttemptAt: new Date(),
        lastErrorCategory: null,
      },
    });
    if (updated.count !== 1) return;
    await tx.serviceConfigurationAudit.create({
      data: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: service.configuration.id,
        action: 'OEM_SUPPORT_EMAIL_RETRY_REQUESTED',
        beforeData: {
          deliveryId: delivery.id,
          candidateId: delivery.candidateId,
          attemptCount: delivery.attemptCount,
          errorCategory: delivery.lastErrorCategory,
        },
        afterData: { deliveryId: delivery.id, status: 'PENDING', attemptCount: 0 },
        reason: 'OEM支援候補メールの再送予約',
        performedByUserId: actor.userId,
      },
    });
  });
  revalidatePath(`/s/${parsed.data.serviceSlug}/manage/personalization`);
}
