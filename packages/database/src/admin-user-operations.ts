import type { AdminOperationsRepository } from '@bunshin/application';
import type { PrismaClient } from './client';

export async function setAdminUserStatus(
  client: PrismaClient,
  input: Parameters<AdminOperationsRepository['setUserStatus']>[0],
): Promise<boolean | null> {
  return client.$transaction(async (tx) => {
    const actor = await tx.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
      select: { id: true },
    });
    if (!actor) return null;
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      include: { platformAdmin: { select: { status: true } } },
    });
    if (!target) return null;
    if (
      target.status === 'DELETED' ||
      target.status === input.status ||
      target.platformAdmin?.status === 'ACTIVE'
    )
      return false;
    await tx.user.update({ where: { id: target.id }, data: { status: input.status } });
    if (input.status === 'SUSPENDED') {
      await tx.lineNotificationPreference.updateMany({
        where: { userId: target.id, enabled: true },
        data: { enabled: false },
      });
    }
    await tx.userOperationAudit.create({
      data: {
        targetUserId: target.id,
        actorUserId: input.actorUserId,
        action: input.status === 'SUSPENDED' ? 'SUSPENDED' : 'REACTIVATED',
        previousStatus: target.status,
        nextStatus: input.status,
        reason: input.reason,
      },
    });
    return true;
  });
}

export async function setAdminMetricExclusion(
  client: PrismaClient,
  input: Parameters<AdminOperationsRepository['setMetricExclusion']>[0],
): Promise<boolean | null> {
  return client.$transaction(async (tx) => {
    const actor = await tx.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
      select: { id: true },
    });
    if (!actor) return null;
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!target) return null;
    const latest = await tx.activityMetricExclusion.findFirst({
      where: { targetUserId: target.id, environment: input.environment },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: { action: true },
    });
    const nextAction = input.excluded ? 'EXCLUDED' : 'INCLUDED';
    if ((latest?.action ?? 'INCLUDED') === nextAction) return false;
    await tx.activityMetricExclusion.create({
      data: {
        targetUserId: target.id,
        actorUserId: input.actorUserId,
        environment: input.environment,
        action: nextAction,
        reason: input.reason,
      },
    });
    return true;
  });
}
