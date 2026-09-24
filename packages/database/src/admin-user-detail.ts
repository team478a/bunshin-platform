import type { AdminOperationsRepository, AdminUserDetail } from '@bunshin/application';
import type { PrismaClient } from './client';
import { adminUserSelect, adminUserSummary } from './admin-user-summary';

export async function getAdminUserDetail(
  client: PrismaClient,
  input: Parameters<AdminOperationsRepository['userDetail']>[0],
): Promise<AdminUserDetail | null> {
  const [row, operationAudits, metricExclusionAudits, supportCases] = await Promise.all([
    client.user.findUnique({
      where: { id: input.userId },
      select: adminUserSelect,
    }),
    client.userOperationAudit.findMany({
      where: { targetUserId: input.userId },
      include: { actor: { select: { displayName: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    }),
    client.activityMetricExclusion.findMany({
      where: { targetUserId: input.userId },
      include: { actor: { select: { displayName: true } } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 50,
    }),
    client.supportCase.findMany({
      where: { targetUserId: input.userId },
      include: {
        assignee: { select: { displayName: true } },
        notes: {
          include: { author: { select: { displayName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 50,
    }),
  ]);
  if (!row) return null;
  const timeline = [
    ...row.missionActivities.map((item) => ({
      type: item.type,
      occurredAt: item.occurredAt,
      label: `投稿案：${item.type}`,
      outcome: 'INFO' as const,
    })),
    ...row.postRecords.map((item) => ({
      type: 'POSTED',
      occurredAt: item.postedAt,
      label: '投稿完了',
      outcome: 'SUCCESS' as const,
    })),
    ...row.aiUsageEvents.map((item) => ({
      type: 'AI',
      occurredAt: item.occurredAt,
      label:
        item.status === 'SUCCESS' ? 'AI処理成功' : `AI処理失敗（${item.errorCode ?? '原因不明'}）`,
      outcome: item.status,
    })),
  ]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, 50);
  return {
    user: adminUserSummary(row, input.environment),
    workspaces: row.memberships.map((item) => ({
      id: item.workspace.id,
      name: item.workspace.name,
      role: item.role,
      status: item.status,
    })),
    bunshins: row.bunshins.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      createdAt: item.createdAt,
    })),
    timeline,
    operationAudits: operationAudits.map((audit) => ({
      id: audit.id,
      action: audit.action,
      previousStatus: audit.previousStatus,
      nextStatus: audit.nextStatus,
      reason: audit.reason,
      actorDisplayName: audit.actor.displayName,
      occurredAt: audit.occurredAt,
    })),
    metricExclusionAudits: metricExclusionAudits.map((audit) => ({
      id: audit.id,
      action: audit.action,
      environment: audit.environment,
      reason: audit.reason,
      actorDisplayName: audit.actor.displayName,
      occurredAt: audit.occurredAt,
    })),
    supportCases: supportCases.map((supportCase) => ({
      id: supportCase.id,
      subject: supportCase.subject,
      status: supportCase.status,
      priority: supportCase.priority,
      assigneeUserId: supportCase.assigneeUserId,
      assigneeDisplayName: supportCase.assignee?.displayName ?? null,
      createdAt: supportCase.createdAt,
      updatedAt: supportCase.updatedAt,
      resolvedAt: supportCase.resolvedAt,
      notes: supportCase.notes.map((note) => ({
        id: note.id,
        content: note.content,
        authorDisplayName: note.author.displayName,
        createdAt: note.createdAt,
      })),
    })),
  };
}
