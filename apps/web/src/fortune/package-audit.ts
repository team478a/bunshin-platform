import 'server-only';
import {
  FORTUNE_PACKAGE_INSTALLED_ACTION,
  FORTUNE_PACKAGE_UPDATED_ACTION,
} from './package-operation-actions';
import { fortuneOperatorScope } from './operator-scope';

export interface FortunePackageAuditEntry {
  id: string;
  action: 'INSTALLED' | 'UPDATED';
  fromVersion: number | null;
  toVersion: number;
  occurredAt: Date;
  actor: string;
}

export async function fortunePackageAuditHistory(
  serviceSlug: string,
  actorUserId: string,
  limit = 20,
): Promise<FortunePackageAuditEntry[]> {
  const service = await fortuneOperatorScope(serviceSlug, actorUserId);
  const db = await import('@bunshin/database');
  const rows = await db.prisma.serviceConfigurationAudit.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      configurationId: service.configuration.id,
      action: { in: [FORTUNE_PACKAGE_INSTALLED_ACTION, FORTUNE_PACKAGE_UPDATED_ACTION] },
    },
    select: {
      id: true,
      action: true,
      beforeData: true,
      afterData: true,
      occurredAt: true,
      performedBy: { select: { displayName: true, email: true } },
    },
    orderBy: { occurredAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
  });

  return rows.flatMap((row) => {
    const before = jsonObject(row.beforeData);
    const after = jsonObject(row.afterData);
    const toVersion = after?.['packageVersion'];
    const fromVersion = before?.['packageVersion'];
    if (typeof toVersion !== 'number') return [];
    return [
      {
        id: row.id,
        action: row.action === FORTUNE_PACKAGE_INSTALLED_ACTION ? 'INSTALLED' : 'UPDATED',
        fromVersion: typeof fromVersion === 'number' ? fromVersion : null,
        toVersion,
        occurredAt: row.occurredAt,
        actor: row.performedBy.displayName || row.performedBy.email || '運営担当者',
      } satisfies FortunePackageAuditEntry,
    ];
  });
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
