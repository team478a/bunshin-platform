import type {
  AdminAuditCategory,
  AdminAuditLogItem,
  AdminAuditLogRepository,
  LineConfigurationEnvironment,
} from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
export class PrismaAdminAuditLogRepository implements AdminAuditLogRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    from: Date;
    to: Date;
    category: AdminAuditCategory | null;
    limit: number;
  }) {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const range = { gte: input.from, lt: input.to };
    const take = input.limit + 1;
    const requested = (category: AdminAuditCategory) =>
      input.category === null || input.category === category;
    const [adminRows, userRows, aiRows, lineRows, menuRows, deletionRows] = await Promise.all([
      requested('ADMIN_ACCESS')
        ? this.client.platformAdminAudit.findMany({
            where: { occurredAt: range },
            include: {
              actor: { select: { displayName: true } },
              target: { select: { displayName: true } },
            },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
      requested('USER_OPERATION')
        ? this.client.userOperationAudit.findMany({
            where: { occurredAt: range },
            include: {
              actor: { select: { displayName: true } },
              target: { select: { displayName: true } },
            },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
      requested('AI_CONFIGURATION')
        ? this.client.aiProviderConfigurationAudit.findMany({
            where: { environment: input.environment, occurredAt: range },
            include: { actor: { select: { displayName: true } } },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
      requested('LINE_CONFIGURATION')
        ? this.client.lineConfigurationAudit.findMany({
            where: { environment: input.environment, occurredAt: range },
            include: { actor: { select: { displayName: true } } },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
      requested('LINE_RICH_MENU')
        ? this.client.lineRichMenuAudit.findMany({
            where: { environment: input.environment, occurredAt: range },
            include: {
              actor: { select: { displayName: true } },
              richMenu: { select: { name: true, version: true } },
            },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
      requested('ACCOUNT_DELETION')
        ? this.client.accountDeletionOperationAudit.findMany({
            where: { occurredAt: range },
            include: { actor: { select: { displayName: true } } },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
    ]);
    const items: AdminAuditLogItem[] = [
      ...adminRows.map((row) => ({
        id: row.id,
        category: 'ADMIN_ACCESS' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: row.target.displayName,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
      ...userRows.map((row) => ({
        id: row.id,
        category: 'USER_OPERATION' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: row.target.displayName,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
      ...aiRows.map((row) => ({
        id: row.id,
        category: 'AI_CONFIGURATION' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: `${row.provider} 設定 ${row.configurationId.slice(0, 8)}`,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
      ...lineRows.map((row) => ({
        id: row.id,
        category: 'LINE_CONFIGURATION' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: `LINE設定 ${row.configurationId.slice(0, 8)}`,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
      ...menuRows.map((row) => ({
        id: row.id,
        category: 'LINE_RICH_MENU' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: `${row.richMenu.name} 第${row.richMenu.version}版`,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
      ...deletionRows.map((row) => ({
        id: row.id,
        category: 'ACCOUNT_DELETION' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: `退会要求 ${row.requestId.slice(0, 8)}`,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
    ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
    return { items: items.slice(0, input.limit), truncated: items.length > input.limit };
  }
}
