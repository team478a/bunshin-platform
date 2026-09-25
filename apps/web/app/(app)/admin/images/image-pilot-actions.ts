'use server';

import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../src/auth/current-user';

const settingsSchema = z
  .object({
    workspaceId: z.uuid(),
    groupId: z.uuid(),
    dailyLimit: z.coerce.number().int().min(1).max(10000),
    monthlyLimit: z.coerce.number().int().min(1).max(100000),
    memberMonthlyLimit: z.coerce.number().int().min(1).max(10000),
    defaultModel: z.string().trim().min(1).max(120),
    defaultQuality: z.string().trim().min(1).max(40),
    startsAt: z.string().max(40),
    endsAt: z.string().max(40),
    emergencyStop: z.enum(['false', 'true']),
    changeReason: z.string().trim().min(5).max(1000),
  })
  .refine(({ startsAt, endsAt }) => !startsAt || !endsAt || new Date(startsAt) < new Date(endsAt), {
    message: 'invalid period',
  });

const optionalDate = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('invalid date');
  return parsed;
};

export async function saveImagePilot(formData: FormData) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/images?error=invalid');
  const db = await import('@bunshin/database');
  const admin = await db.prisma.platformAdmin.findFirst({
    where: { userId: actor.userId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
  if (!admin) notFound();
  const memberIds = [...new Set(formData.getAll('memberId').map(String))];
  try {
    await db.prisma.$transaction(
      async (tx) => {
        const group = await tx.group.findFirst({
          where: {
            id: input.data.groupId,
            workspaceId: input.data.workspaceId,
            status: 'ACTIVE',
            featurePolicies: {
              some: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
            },
          },
          select: { id: true },
        });
        if (!group) throw new Error('group unavailable');
        const eligible = await tx.groupMembership.findMany({
          where: {
            id: { in: memberIds },
            workspaceId: input.data.workspaceId,
            groupId: input.data.groupId,
            status: 'ACTIVE',
            consentedAt: { not: null },
            featureAssignments: {
              some: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
            },
          },
          select: { id: true },
        });
        if (eligible.length !== memberIds.length) throw new Error('member unavailable');
        const latest = await tx.socialImageGenerationPilot.findFirst({
          where: { groupId: input.data.groupId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        await tx.socialImageGenerationPilot.updateMany({
          where: { groupId: input.data.groupId, status: 'ACTIVE' },
          data: { status: 'SUPERSEDED' },
        });
        const pilot = await tx.socialImageGenerationPilot.create({
          data: {
            workspaceId: input.data.workspaceId,
            groupId: input.data.groupId,
            version: (latest?.version ?? 0) + 1,
            status: 'ACTIVE',
            startsAt: optionalDate(input.data.startsAt),
            endsAt: optionalDate(input.data.endsAt),
            dailyLimit: input.data.dailyLimit,
            monthlyLimit: input.data.monthlyLimit,
            memberMonthlyLimit: input.data.memberMonthlyLimit,
            defaultModel: input.data.defaultModel,
            defaultQuality: input.data.defaultQuality,
            emergencyStop: input.data.emergencyStop === 'true',
            changeReason: input.data.changeReason,
            createdByUserId: actor.userId,
            updatedByUserId: actor.userId,
          },
        });
        if (eligible.length)
          await tx.socialImagePilotEnrollment.createMany({
            data: eligible.map((member) => ({
              workspaceId: input.data.workspaceId,
              groupId: input.data.groupId,
              pilotId: pilot.id,
              groupMembershipId: member.id,
              status: 'ACTIVE',
              consentedAt: new Date(),
            })),
          });
      },
      { isolationLevel: 'Serializable' },
    );
  } catch {
    redirect(`/admin/images?groupId=${input.data.groupId}&error=failed`);
  }
  revalidatePath('/admin/images');
  revalidatePath(`/groups/${input.data.groupId}/image-operations`);
  redirect(`/admin/images?groupId=${input.data.groupId}&saved=1`);
}
