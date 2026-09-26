'use server';

import {
  CreateAdminSupportCase,
  SetAdminMetricExclusion,
  SetAdminUserStatus,
  UpdateAdminSupportCase,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../../src/line/secure-configuration';

const statusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(5).max(1000),
});
const metricExclusionSchema = z.object({
  userId: z.uuid(),
  excluded: z.enum(['true', 'false']).transform((value) => value === 'true'),
  reason: z.string().trim().min(5).max(1000),
});
const createCaseSchema = z.object({
  userId: z.uuid(),
  subject: z.string().trim().min(3).max(200),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  note: z.string().trim().min(5).max(2000),
});
const updateCaseSchema = z.object({
  userId: z.uuid(),
  supportCaseId: z.uuid(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  assigneeUserId: z.union([z.uuid(), z.literal('')]).transform((value) => value || null),
  note: z.string().trim().min(5).max(2000),
});

function operationError(error: unknown, userId: string): never {
  const code =
    error instanceof ApplicationError && error.code === 'CONFLICT'
      ? 'protected'
      : error instanceof ApplicationError && error.code === 'FORBIDDEN'
        ? 'forbidden'
        : 'failed';
  redirect(`/admin/users/${userId}?error=${code}`);
}

async function actorUserId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  return actor.userId;
}

export async function setUserStatus(formData: FormData) {
  const actor = await actorUserId();
  const input = statusSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/users?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new SetAdminUserStatus(new db.PrismaAdminOperationsRepository()).execute({
      actorUserId: actor,
      ...input.data,
    });
  } catch (error) {
    operationError(error, input.data.userId);
  }
  revalidatePath(`/admin/users/${input.data.userId}`);
  redirect(`/admin/users/${input.data.userId}?saved=1`);
}

export async function setMetricExclusion(formData: FormData) {
  const actor = await actorUserId();
  const input = metricExclusionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/users?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new SetAdminMetricExclusion(new db.PrismaAdminOperationsRepository()).execute({
      actorUserId: actor,
      environment: currentLineEnvironment(),
      ...input.data,
    });
  } catch (error) {
    operationError(error, input.data.userId);
  }
  revalidatePath(`/admin/users/${input.data.userId}`);
  revalidatePath('/admin/reports');
  redirect(`/admin/users/${input.data.userId}?saved=1`);
}

export async function createSupportCase(formData: FormData) {
  const actor = await actorUserId();
  const input = createCaseSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/users?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new CreateAdminSupportCase(new db.PrismaAdminOperationsRepository()).execute({
      actorUserId: actor,
      ...input.data,
    });
  } catch (error) {
    operationError(error, input.data.userId);
  }
  revalidatePath(`/admin/users/${input.data.userId}`);
  redirect(`/admin/users/${input.data.userId}?saved=1`);
}

export async function updateSupportCase(formData: FormData) {
  const actor = await actorUserId();
  const input = updateCaseSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/users?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new UpdateAdminSupportCase(new db.PrismaAdminOperationsRepository()).execute({
      actorUserId: actor,
      ...input.data,
    });
  } catch (error) {
    operationError(error, input.data.userId);
  }
  revalidatePath(`/admin/users/${input.data.userId}`);
  redirect(`/admin/users/${input.data.userId}?saved=1`);
}
