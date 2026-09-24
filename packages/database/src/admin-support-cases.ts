import type { AdminOperationsRepository } from '@bunshin/application';
import type { PrismaClient } from './client';

export async function createAdminSupportCase(
  client: PrismaClient,
  input: Parameters<AdminOperationsRepository['createSupportCase']>[0],
): Promise<boolean | null> {
  return client.$transaction(async (tx) => {
    const admin = await tx.platformAdmin.findFirst({
      where: {
        userId: input.actorUserId,
        status: 'ACTIVE',
        role: { in: ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT'] },
      },
      select: { id: true },
    });
    if (!admin) return false;
    if (!(await tx.user.findUnique({ where: { id: input.userId }, select: { id: true } })))
      return null;
    await tx.supportCase.create({
      data: {
        targetUserId: input.userId,
        createdByUserId: input.actorUserId,
        assigneeUserId: input.actorUserId,
        subject: input.subject,
        priority: input.priority,
        notes: { create: { authorUserId: input.actorUserId, content: input.note } },
      },
    });
    return true;
  });
}

export async function updateAdminSupportCase(
  client: PrismaClient,
  input: Parameters<AdminOperationsRepository['updateSupportCase']>[0],
): Promise<boolean | null> {
  return client.$transaction(async (tx) => {
    const admin = await tx.platformAdmin.findFirst({
      where: {
        userId: input.actorUserId,
        status: 'ACTIVE',
        role: { in: ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT'] },
      },
      select: { id: true },
    });
    if (!admin) return false;
    const supportCase = await tx.supportCase.findFirst({
      where: { id: input.supportCaseId, targetUserId: input.userId },
      select: { id: true },
    });
    if (!supportCase) return null;
    if (input.assigneeUserId) {
      const assignee = await tx.platformAdmin.findFirst({
        where: { userId: input.assigneeUserId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!assignee) return false;
    }
    await tx.supportCase.update({
      where: { id: supportCase.id },
      data: {
        status: input.status,
        priority: input.priority,
        assigneeUserId: input.assigneeUserId,
        resolvedAt: input.status === 'RESOLVED' ? new Date() : null,
        notes: { create: { authorUserId: input.actorUserId, content: input.note } },
      },
    });
    return true;
  });
}

export async function listAdminSupportCases(
  client: PrismaClient,
  input: Parameters<AdminOperationsRepository['listSupportCases']>[0],
) {
  const authorized = Boolean(
    await client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    }),
  );
  if (!authorized) return null;
  return (
    await client.supportCase.findMany({
      where: input.status ? { status: input.status } : {},
      include: {
        target: { select: { displayName: true, email: true } },
        assignee: { select: { displayName: true } },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    })
  ).map((item) => ({
    id: item.id,
    targetUserId: item.targetUserId,
    targetDisplayName: item.target.displayName,
    targetEmail: item.target.email,
    subject: item.subject,
    status: item.status,
    priority: item.priority,
    assigneeDisplayName: item.assignee?.displayName ?? null,
    updatedAt: item.updatedAt,
  }));
}
