'use server';

import {
  CreateAndSubmitGroupBadge,
  NominateGroupBadgeCandidate,
  RevokeGroupBadgeAward,
  ReviseGroupBadge,
  ReviewGroupBadge,
  ReviewGroupBadgeCandidate,
  SetGroupBadgeAvailability,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import {
  BADGE_APPEARANCE_KEYS,
  badgeAppearanceImageKey,
} from '../../../../../src/badges/badge-appearance';
import { serviceManagementReturnPath } from '../../../../../src/services/service-management-return';

const draftSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  code: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  badgeStyle: z.enum(BADGE_APPEARANCE_KEYS),
  altText: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(3).max(1000),
  serviceSlug: z.string().trim().max(120).optional(),
});

const nominateSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  badgeVersionId: z.uuid(),
  userId: z.uuid(),
  reason: z.string().trim().min(3).max(1000),
  serviceSlug: z.string().trim().max(120).optional(),
});

const reviewSchema = z.object({
  groupId: z.uuid(),
  candidateId: z.uuid(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().min(3).max(1000),
  serviceSlug: z.string().trim().max(120).optional(),
});

const revokeSchema = z.object({
  groupId: z.uuid(),
  awardId: z.uuid(),
  reason: z.string().trim().min(3).max(1000),
  serviceSlug: z.string().trim().max(120).optional(),
});

const availabilitySchema = z.object({
  groupId: z.uuid(),
  definitionId: z.uuid(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(3).max(1000),
  serviceSlug: z.string().trim().max(120).optional(),
});

const revisionSchema = z.object({
  groupId: z.uuid(),
  definitionId: z.uuid(),
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  badgeStyle: z.enum(BADGE_APPEARANCE_KEYS),
  altText: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(3).max(1000),
  serviceSlug: z.string().trim().max(120).optional(),
});

const path = (groupId: string) => `/groups/${groupId}/badges` as Route;
const errorCode = (error: unknown) =>
  error instanceof ApplicationError && error.code === 'FORBIDDEN' ? 'forbidden' : 'failed';

export async function createBadge(formData: FormData) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = draftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = await serviceManagementReturnPath({
    groupId: parsed.data.groupId,
    serviceSlug: parsed.data.serviceSlug,
    section: 'badges',
  });
  try {
    const db = await import('@bunshin/database');
    const repository = new db.PrismaBadgeGroupWorkflowRepository(db.prisma);
    const created = await new CreateAndSubmitGroupBadge(repository).execute({
      ...parsed.data,
      imageKey: badgeAppearanceImageKey(parsed.data.badgeStyle),
      actorUserId: actor.userId,
    });
    if (parsed.data.serviceSlug) {
      await new ReviewGroupBadge(repository).execute({
        approvalRequestId: created.approvalRequestId,
        actorUserId: actor.userId,
        decision: 'APPROVED',
        reason: `サービス運営者による公開: ${parsed.data.reason}`,
      });
    }
  } catch (error) {
    redirect(`${returnPath}?error=${errorCode(error)}` as Route);
  }
  revalidatePath(path(parsed.data.groupId));
  redirect(`${returnPath}?created=1` as Route);
}

export async function nominate(formData: FormData) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = nominateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = await serviceManagementReturnPath({
    groupId: parsed.data.groupId,
    serviceSlug: parsed.data.serviceSlug,
    section: 'badges',
  });
  try {
    const db = await import('@bunshin/database');
    const repository = new db.PrismaBadgeGroupWorkflowRepository(db.prisma);
    const candidate = await new NominateGroupBadgeCandidate(repository).execute({
      ...parsed.data,
      actorUserId: actor.userId,
    });
    if (parsed.data.serviceSlug) {
      await new ReviewGroupBadgeCandidate(repository).execute({
        candidateId: candidate.id,
        actorUserId: actor.userId,
        decision: 'APPROVED',
        reason: `サービス運営者による直接付与: ${parsed.data.reason}`,
      });
    }
  } catch (error) {
    redirect(`${returnPath}?error=${errorCode(error)}` as Route);
  }
  revalidatePath(path(parsed.data.groupId));
  redirect(`${returnPath}?nominated=1` as Route);
}

export async function reviewCandidate(formData: FormData) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = await serviceManagementReturnPath({
    groupId: parsed.data.groupId,
    serviceSlug: parsed.data.serviceSlug,
    section: 'badges',
  });
  try {
    const db = await import('@bunshin/database');
    await new ReviewGroupBadgeCandidate(
      new db.PrismaBadgeGroupWorkflowRepository(db.prisma),
    ).execute({
      candidateId: parsed.data.candidateId,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
      actorUserId: actor.userId,
    });
  } catch (error) {
    redirect(`${returnPath}?error=${errorCode(error)}` as Route);
  }
  revalidatePath(path(parsed.data.groupId));
  redirect(`${returnPath}?reviewed=1` as Route);
}

export async function revokeAward(formData: FormData) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = revokeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = await serviceManagementReturnPath({
    groupId: parsed.data.groupId,
    serviceSlug: parsed.data.serviceSlug,
    section: 'badges',
  });
  try {
    const db = await import('@bunshin/database');
    await new RevokeGroupBadgeAward(new db.PrismaBadgeGroupWorkflowRepository(db.prisma)).execute({
      awardId: parsed.data.awardId,
      actorUserId: actor.userId,
      reason: parsed.data.reason,
    });
  } catch (error) {
    redirect(`${returnPath}?error=${errorCode(error)}` as Route);
  }
  revalidatePath(path(parsed.data.groupId));
  revalidatePath('/badges');
  if (parsed.data.serviceSlug) revalidatePath(`/s/${parsed.data.serviceSlug}/activity`);
  redirect(`${returnPath}?revoked=1` as Route);
}

export async function setBadgeAvailability(formData: FormData) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = availabilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = await serviceManagementReturnPath({
    groupId: parsed.data.groupId,
    serviceSlug: parsed.data.serviceSlug,
    section: 'badges',
  });
  try {
    const db = await import('@bunshin/database');
    await new SetGroupBadgeAvailability(
      new db.PrismaBadgeGroupWorkflowRepository(db.prisma),
    ).execute({
      definitionId: parsed.data.definitionId,
      actorUserId: actor.userId,
      status: parsed.data.status,
      reason: parsed.data.reason,
    });
  } catch (error) {
    redirect(`${returnPath}?error=${errorCode(error)}` as Route);
  }
  revalidatePath(path(parsed.data.groupId));
  revalidatePath('/badges');
  if (parsed.data.serviceSlug) revalidatePath(`/s/${parsed.data.serviceSlug}/activity`);
  redirect(`${returnPath}?availability=${parsed.data.status.toLowerCase()}` as Route);
}

export async function reviseBadge(formData: FormData) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = revisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = await serviceManagementReturnPath({
    groupId: parsed.data.groupId,
    serviceSlug: parsed.data.serviceSlug,
    section: 'badges',
  });
  try {
    const db = await import('@bunshin/database');
    await new ReviseGroupBadge(new db.PrismaBadgeGroupWorkflowRepository(db.prisma)).execute({
      ...parsed.data,
      imageKey: badgeAppearanceImageKey(parsed.data.badgeStyle),
      actorUserId: actor.userId,
    });
  } catch (error) {
    redirect(`${returnPath}?error=${errorCode(error)}` as Route);
  }
  revalidatePath(path(parsed.data.groupId));
  revalidatePath('/badges');
  if (parsed.data.serviceSlug) revalidatePath(`/s/${parsed.data.serviceSlug}/activity`);
  redirect(`${returnPath}?revised=1` as Route);
}
