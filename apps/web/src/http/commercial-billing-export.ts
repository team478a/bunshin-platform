import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { csv } from './admin-report-export';

export function commercialBillingCsvRows(
  invoices: Array<{
    invoiceNumber: string;
    status: string;
    periodStart: Date;
    mau: number;
    pricingTierKey: string;
    pricingVersion: string;
    amountYen: number;
    externalInvoiceReference: string | null;
    paymentReference: string | null;
    notes: string | null;
    issuedAt: Date | null;
    dueAt: Date | null;
    paidAt: Date | null;
    workspace: { name: string; legalName: string | null };
    contract: {
      billingName: string;
      billingEmail: string;
      externalCustomerReference: string | null;
    };
  }>,
) {
  return [
    [
      '内部請求番号',
      '運営団体',
      '法人名',
      '請求先名',
      '請求先メール',
      '対象月',
      'MAU',
      '料金帯',
      '料金版',
      '金額（円）',
      '状態',
      '発行日時',
      '支払期限',
      '入金日時',
      '外部請求書番号',
      '入金参照番号',
      '外部顧客番号',
      'メモ',
    ],
    ...invoices.map((invoice) => [
      invoice.invoiceNumber,
      invoice.workspace.name,
      invoice.workspace.legalName,
      invoice.contract.billingName,
      invoice.contract.billingEmail,
      invoice.periodStart.toISOString().slice(0, 7),
      invoice.mau,
      invoice.pricingTierKey,
      invoice.pricingVersion,
      invoice.amountYen,
      invoice.status,
      invoice.issuedAt?.toISOString() ?? null,
      invoice.dueAt?.toISOString() ?? null,
      invoice.paidAt?.toISOString() ?? null,
      invoice.externalInvoiceReference,
      invoice.paymentReference,
      invoice.contract.externalCustomerReference,
      invoice.notes,
    ]),
  ];
}

export async function commercialBillingExportResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const db = await import('@bunshin/database');
    const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
      actor.userId,
    );
    if (!admin || admin.role !== 'SUPER_ADMIN')
      throw new ApplicationError('FORBIDDEN', 'super admin required');
    const dashboard = await new db.PrismaCommercialBillingService().operationsDashboard();
    return new Response(csv(commercialBillingCsvRows(dashboard.invoices)), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="commercial-billing.csv"',
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
