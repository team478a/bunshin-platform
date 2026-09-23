'use server';

import {
  GroupFeatureEntitlementService,
  GroupParticipationService,
  ServiceStaffRoleService,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { serviceManagementReturnPath } from '../../../../../src/services/service-management-return';

const assignmentSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  groupMembershipId: z.uuid(),
  featureKey: z.string().trim().min(1).max(120),
  status: z.enum(['ENABLED', 'DISABLED']),
  dailyLimit: z.string().max(20),
  monthlyLimit: z.string().max(20),
  startsAt: z.string().max(40),
  endsAt: z.string().max(40),
  reason: z.string().trim().min(5).max(1000),
  serviceSlug: z.string().trim().max(120).optional(),
});

const membershipSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  groupMembershipId: z.uuid(),
  role: z.enum(['MANAGER', 'PARTICIPANT']),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']),
  reason: z.string().trim().min(5).max(1000),
  serviceSlug: z.string().trim().max(120).optional(),
});

const approvalSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  groupMembershipId: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
  serviceSlug: z.string().trim().max(120).optional(),
});

const serviceRoleSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  groupMembershipId: z.uuid(),
  serviceRole: z.enum(['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR', 'PARTICIPANT']),
  reason: z.string().trim().min(5).max(1000),
  serviceSlug: z.string().trim().min(1).max(120),
});

function optionalLimit(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid limit');
  return parsed;
}

function optionalDate(value: string): Date | null {
  if (value.trim() === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid date');
  return parsed;
}

function memberPath(groupId: string, membershipId?: string, suffix = ''): Route {
  const query = membershipId ? `?member=${membershipId}${suffix}` : suffix;
  return `/groups/${groupId}/members${query}` as Route;
}

async function memberReturnPath(
  groupId: string,
  serviceSlug?: string,
  membershipId?: string,
  suffix = '',
) {
  const query = membershipId ? `?member=${membershipId}${suffix}` : suffix;
  return serviceManagementReturnPath({ groupId, serviceSlug, section: 'members', query });
}

export async function saveMemberFeatureAssignment(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const returnPath = await memberReturnPath(
    input.data.groupId,
    input.data.serviceSlug,
    input.data.groupMembershipId,
  );
  try {
    const db = await import('@bunshin/database');
    await new GroupFeatureEntitlementService(
      new db.PrismaGroupFeatureEntitlementRepository(),
    ).setMemberAssignment({
      ...input.data,
      actorUserId: actor.userId,
      dailyLimit: optionalLimit(input.data.dailyLimit),
      monthlyLimit: optionalLimit(input.data.monthlyLimit),
      startsAt: optionalDate(input.data.startsAt),
      endsAt: optionalDate(input.data.endsAt),
    });
  } catch (error) {
    const code =
      error instanceof ApplicationError && error.code === 'VALIDATION_ERROR'
        ? 'invalid'
        : error instanceof ApplicationError && error.code === 'FORBIDDEN'
          ? 'forbidden'
          : 'failed';
    redirect(`${returnPath}&error=${code}` as Route);
  }
  revalidatePath(memberPath(input.data.groupId));
  redirect(`${returnPath}&saved=1` as Route);
}

export async function saveMembership(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = membershipSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const returnPath = await memberReturnPath(
    input.data.groupId,
    input.data.serviceSlug,
    input.data.groupMembershipId,
  );
  try {
    const db = await import('@bunshin/database');
    await new GroupParticipationService(
      new db.PrismaGroupParticipationRepository(),
    ).updateMembership({ ...input.data, actorUserId: actor.userId });
  } catch (error) {
    const code =
      error instanceof ApplicationError && error.code === 'VALIDATION_ERROR'
        ? 'member-invalid'
        : error instanceof ApplicationError && error.code === 'FORBIDDEN'
          ? 'member-forbidden'
          : 'member-failed';
    redirect(`${returnPath}&error=${code}` as Route);
  }
  revalidatePath(memberPath(input.data.groupId));
  redirect(`${returnPath}&memberSaved=1` as Route);
}

export async function saveServiceRole(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = serviceRoleSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const returnPath = await memberReturnPath(
    input.data.groupId,
    input.data.serviceSlug,
    input.data.groupMembershipId,
  );
  try {
    const db = await import('@bunshin/database');
    await new ServiceStaffRoleService(new db.PrismaServiceStaffRoleRepository()).set({
      workspaceId: input.data.workspaceId,
      groupId: input.data.groupId,
      membershipId: input.data.groupMembershipId,
      serviceRole: input.data.serviceRole,
      actorUserId: actor.userId,
      reason: input.data.reason,
    });
  } catch (error) {
    const code =
      error instanceof ApplicationError && error.code === 'VALIDATION_ERROR'
        ? 'staff-invalid'
        : error instanceof ApplicationError && error.code === 'FORBIDDEN'
          ? 'staff-forbidden'
          : 'staff-failed';
    redirect(`${returnPath}&error=${code}` as Route);
  }
  revalidatePath(memberPath(input.data.groupId));
  revalidatePath(`/s/${input.data.serviceSlug}/manage/members`);
  redirect(`${returnPath}&staffSaved=1` as Route);
}

export async function approveParticipation(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = approvalSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const returnPath = await memberReturnPath(input.data.groupId, input.data.serviceSlug);
  try {
    const db = await import('@bunshin/database');
    const { ServiceParticipationService } = await import('@bunshin/application');
    await new ServiceParticipationService(new db.PrismaServiceParticipationRepository()).approve({
      workspaceId: input.data.workspaceId,
      serviceId: input.data.groupId,
      groupMembershipId: input.data.groupMembershipId,
      actorUserId: actor.userId,
      reason: input.data.reason,
    });
  } catch (error) {
    const code =
      error instanceof ApplicationError && error.code === 'VALIDATION_ERROR'
        ? 'approval-invalid'
        : error instanceof ApplicationError && error.code === 'FORBIDDEN'
          ? 'approval-forbidden'
          : 'approval-failed';
    redirect(`${returnPath}?error=${code}` as Route);
  }
  revalidatePath(memberPath(input.data.groupId));
  redirect(`${returnPath}?approved=1` as Route);
}
