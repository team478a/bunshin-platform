import 'server-only';
import {
  badgeAuditActionLabels,
  displayName,
  jsonCell,
  pointAuditActionLabel,
  timestamp,
} from './service-reward-export-format';

export async function auditRows(workspaceId: string, groupId: string) {
  const db = await import('@bunshin/database');
  const [pointAudits, badgeAudits] = await Promise.all([
    db.prisma.serviceConfigurationAudit.findMany({
      where: {
        workspaceId,
        groupId,
        action: {
          in: [
            'POINT_RULES_UPDATED',
            'POINT_BONUS_GRANTED',
            'POINT_BALANCE_CORRECTED',
            'POINT_RECOVERY_REGISTERED',
            'POINT_RECOVERY_CANCELLED',
          ],
        },
      },
      select: {
        id: true,
        action: true,
        beforeData: true,
        afterData: true,
        reason: true,
        occurredAt: true,
        performedBy: { select: { displayName: true, email: true } },
      },
    }),
    db.prisma.badgeAdminAuditLog.findMany({
      where: { workspaceId, groupId },
      select: {
        id: true,
        action: true,
        beforeData: true,
        afterData: true,
        reason: true,
        occurredAt: true,
        badgeDefinition: {
          select: {
            code: true,
            versions: { select: { title: true }, orderBy: { version: 'desc' }, take: 1 },
          },
        },
        badgeVersion: {
          select: { title: true, definition: { select: { code: true } } },
        },
        badgeAward: {
          select: {
            userId: true,
            user: { select: { displayName: true, email: true } },
          },
        },
        performedBy: { select: { displayName: true, email: true } },
      },
    }),
  ]);
  const targetUserIds = new Set<string>();
  for (const audit of [...pointAudits, ...badgeAudits]) {
    const data =
      audit.afterData && typeof audit.afterData === 'object' && !Array.isArray(audit.afterData)
        ? (audit.afterData as Record<string, unknown>)
        : {};
    const userId =
      typeof data.targetUserId === 'string'
        ? data.targetUserId
        : typeof data.userId === 'string'
          ? data.userId
          : null;
    if (userId) targetUserIds.add(userId);
  }
  const users = await db.prisma.user.findMany({
    where: { id: { in: [...targetUserIds] } },
    select: { id: true, displayName: true, email: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  const rows = [
    ...pointAudits.map((audit) => {
      const data =
        audit.afterData && typeof audit.afterData === 'object' && !Array.isArray(audit.afterData)
          ? (audit.afterData as Record<string, unknown>)
          : {};
      const targetUserId = typeof data.userId === 'string' ? data.userId : '';
      const target = targetUserId ? userById.get(targetUserId) : null;
      return {
        id: audit.id,
        occurredAt: audit.occurredAt,
        category: 'ポイント',
        action: pointAuditActionLabel(audit.action),
        actor: displayName(audit.performedBy),
        targetUserId,
        target: target ? displayName(target) : '',
        badgeCode: '',
        badgeTitle: '',
        reason: audit.reason,
        beforeData: audit.beforeData,
        afterData: audit.afterData,
      };
    }),
    ...badgeAudits.map((audit) => {
      const data =
        audit.afterData && typeof audit.afterData === 'object' && !Array.isArray(audit.afterData)
          ? (audit.afterData as Record<string, unknown>)
          : {};
      const targetUserId =
        audit.badgeAward?.userId ??
        (typeof data.targetUserId === 'string'
          ? data.targetUserId
          : typeof data.userId === 'string'
            ? data.userId
            : '');
      const target = audit.badgeAward?.user ?? (targetUserId ? userById.get(targetUserId) : null);
      return {
        id: audit.id,
        occurredAt: audit.occurredAt,
        category: 'バッジ',
        action: badgeAuditActionLabels[audit.action] ?? audit.action,
        actor: displayName(audit.performedBy),
        targetUserId,
        target: target ? displayName(target) : '',
        badgeCode: audit.badgeVersion?.definition.code ?? audit.badgeDefinition?.code ?? '',
        badgeTitle: audit.badgeVersion?.title ?? audit.badgeDefinition?.versions[0]?.title ?? '',
        reason: audit.reason,
        beforeData: audit.beforeData,
        afterData: audit.afterData,
      };
    }),
  ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
  return [
    [
      '履歴ID',
      '日時',
      '分類',
      '操作',
      '実行者',
      '対象参加者ID',
      '対象参加者名',
      'バッジコード',
      'バッジ名',
      '理由',
      '変更前',
      '変更後',
    ],
    ...rows.map((row) => [
      row.id,
      timestamp(row.occurredAt),
      row.category,
      row.action,
      row.actor,
      row.targetUserId,
      row.target,
      row.badgeCode,
      row.badgeTitle,
      row.reason,
      jsonCell(row.beforeData),
      jsonCell(row.afterData),
    ]),
  ];
}
