import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';

export const ADMIN_AUDIT_CATEGORIES = [
  'ADMIN_ACCESS',
  'USER_OPERATION',
  'AI_CONFIGURATION',
  'LINE_CONFIGURATION',
  'LINE_RICH_MENU',
  'ACCOUNT_DELETION',
] as const;
export type AdminAuditCategory = (typeof ADMIN_AUDIT_CATEGORIES)[number];

export interface AdminAuditLogItem {
  id: string;
  category: AdminAuditCategory;
  action: string;
  actorDisplayName: string;
  targetLabel: string;
  reason: string;
  occurredAt: Date;
}

export interface AdminAuditLogRepository {
  list(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    from: Date;
    to: Date;
    category: AdminAuditCategory | null;
    limit: number;
  }): Promise<{ items: AdminAuditLogItem[]; truncated: boolean } | null>;
}

export class ListAdminAuditLogs {
  constructor(private readonly repository: AdminAuditLogRepository) {}
  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    from: Date;
    to: Date;
    category?: string | null;
    limit?: number;
  }) {
    if (
      Number.isNaN(input.from.getTime()) ||
      Number.isNaN(input.to.getTime()) ||
      input.from >= input.to ||
      input.to.getTime() - input.from.getTime() > 366 * 86_400_000
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid audit period');
    const category = input.category ?? null;
    if (category !== null && !ADMIN_AUDIT_CATEGORIES.includes(category as AdminAuditCategory))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid audit category');
    const limit = input.limit ?? 200;
    if (!Number.isInteger(limit) || limit < 1 || limit > 5_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid audit limit');
    const result = await this.repository.list({
      actorUserId: input.actorUserId,
      environment: input.environment,
      from: input.from,
      to: input.to,
      category: category as AdminAuditCategory | null,
      limit,
    });
    if (!result) throw new ApplicationError('NOT_FOUND', 'audit log not found');
    return result;
  }
}
