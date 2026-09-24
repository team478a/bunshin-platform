import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { REWARDS } from './point-definitions';

const pointControlSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  target: z.enum(['stop', 'resume']),
  reason: z.string().trim().min(3).max(1000),
});

const pilotPeriodPresetSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(5).max(1000),
});

const rewardSettingsSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(3).max(1000),
  ALTERNATIVE_PLAN_GENERATION: z.coerce.number().int().min(1).max(10000),
  SOCIAL_IMAGE_GENERATION: z.coerce.number().int().min(1).max(10000),
});

export async function saveRewardSettings(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = rewardSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = `/s/${parsed.data.serviceSlug}/manage/points` as Route;
  try {
    const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    await db.prisma.$transaction(async (tx) => {
      const [configuration, previous] = await Promise.all([
        tx.serviceConfiguration.findFirst({
          where: { workspaceId: service.workspaceId, groupId: service.serviceId },
          select: { id: true },
        }),
        tx.servicePointRewardSetting.findMany({
          where: { workspaceId: service.workspaceId, groupId: service.serviceId },
          select: { rewardType: true, status: true, pointCost: true },
        }),
      ]);
      if (!configuration) throw new Error('SERVICE_NOT_FOUND');
      const after = [];
      for (const reward of REWARDS) {
        const status = formData.get(`enabled_${reward.type}`) === 'on' ? 'ACTIVE' : 'SUSPENDED';
        const pointCost = parsed.data[reward.type];
        await tx.servicePointRewardSetting.upsert({
          where: {
            workspaceId_groupId_rewardType: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              rewardType: reward.type,
            },
          },
          create: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            rewardType: reward.type,
            status,
            pointCost,
            updatedByUserId: actor.userId,
          },
          update: { status, pointCost, updatedByUserId: actor.userId },
        });
        after.push({ rewardType: reward.type, status, pointCost });
      }
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          configurationId: configuration.id,
          action: 'POINT_REWARDS_UPDATED',
          beforeData: previous,
          afterData: after,
          reason: parsed.data.reason,
          performedByUserId: actor.userId,
        },
      });
    });
  } catch {
    redirect(`${returnPath}?error=rewards` as Route);
  }
  revalidatePath(returnPath);
  revalidatePath('/points');
  revalidatePath(`/s/${parsed.data.serviceSlug}/bunshins`);
  revalidatePath(`/s/${parsed.data.serviceSlug}/images`);
  redirect(`${returnPath}?rewards=1` as Route);
}

export async function changePointIssuance(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = pointControlSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = `/s/${parsed.data.serviceSlug}/manage/points` as Route;
  try {
    const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const targetStopped = parsed.data.target === 'stop';
    await db.prisma.$transaction(async (tx) => {
      const configuration = await tx.serviceConfiguration.findFirst({
        where: { workspaceId: service.workspaceId, groupId: service.serviceId },
        select: { id: true, pointIssuanceStopped: true },
      });
      if (!configuration) throw new Error('SERVICE_NOT_FOUND');
      if (configuration.pointIssuanceStopped === targetStopped) return;
      await tx.serviceConfiguration.update({
        where: { id: configuration.id },
        data: { pointIssuanceStopped: targetStopped, updatedByUserId: actor.userId },
      });
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          configurationId: configuration.id,
          action: targetStopped ? 'POINT_ISSUANCE_STOPPED' : 'POINT_ISSUANCE_RESUMED',
          beforeData: { pointIssuanceStopped: configuration.pointIssuanceStopped },
          afterData: { pointIssuanceStopped: targetStopped },
          reason: parsed.data.reason,
          performedByUserId: actor.userId,
        },
      });
    });
  } catch {
    redirect(`${returnPath}?error=control` as Route);
  }
  revalidatePath(returnPath);
  redirect(`${returnPath}?control=${parsed.data.target}` as Route);
}

export async function startFourWeekPilot(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = pilotPeriodPresetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = `/s/${parsed.data.serviceSlug}/manage/points` as Route;
  try {
    const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const startsAt = new Date();
    await db.prisma.$transaction(
      (tx) =>
        db.startFourWeekRewardsPilot(tx, {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          actorUserId: actor.userId,
          reason: parsed.data.reason,
          now: startsAt,
        }),
      { isolationLevel: 'Serializable' },
    );
  } catch {
    redirect(`${returnPath}?error=pilot-period` as Route);
  }
  revalidatePath(returnPath);
  revalidatePath(`/s/${parsed.data.serviceSlug}/manage/members`);
  redirect(`${returnPath}?pilotPeriod=1` as Route);
}
