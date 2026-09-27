'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';

const inputSchema = z.object({
  serviceSlug: z.string().min(1).max(80),
  candidateId: z.string().uuid(),
  action: z.enum(['ACCEPT', 'DISMISS', 'COMPLETE']),
  reason: z.string().trim().min(1).max(500),
});

export async function transitionOemSupportCandidateAction(form: FormData) {
  const parsed = inputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) return;
  const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId).catch(
    () => null,
  );
  if (!service) return;
  const db = await import('@bunshin/database');
  await db.transitionSocialActivityOemSupportCandidate(db.prisma, {
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
    candidateId: parsed.data.candidateId,
    action: parsed.data.action,
    reason: parsed.data.reason,
  });
  revalidatePath(`/s/${parsed.data.serviceSlug}/manage/personalization`);
}
