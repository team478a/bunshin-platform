import 'server-only';
import { ListAdminAuditLogs } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { currentLineEnvironment } from '../line/secure-configuration';
import { auditActionLabel, auditCategoryLabels } from '../admin/audit-display';
import { csv } from './admin-report-export';

const date = (value: string | null, end: boolean) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid date');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid date');
  return end ? new Date(parsed.getTime() + 86_400_000) : parsed;
};

export async function adminAuditExportResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const url = new URL(request.url);
    const fromInput = url.searchParams.get('from');
    const toInput = url.searchParams.get('to');
    const db = await import('@bunshin/database');
    const result = await new ListAdminAuditLogs(new db.PrismaAdminAuditLogRepository()).execute({
      actorUserId: actor.userId,
      environment: currentLineEnvironment(),
      from: date(fromInput, false),
      to: date(toInput, true),
      category: url.searchParams.get('category'),
      limit: 5_000,
    });
    const body = csv([
      ['日時', '種類', '操作', '対象', '担当者', '理由'],
      ...result.items.map((item) => [
        item.occurredAt.toISOString(),
        auditCategoryLabels[item.category],
        auditActionLabel(item.action),
        item.targetLabel,
        item.actorDisplayName,
        item.reason,
      ]),
    ]);
    return new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="bunshin-audits-${fromInput}-${toInput}.csv"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
