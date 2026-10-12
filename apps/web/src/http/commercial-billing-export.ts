import 'server-only';
import { invoiceBillableUserCount } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { csv } from './admin-report-export';

export function commercialBillingCsvRows(
  invoices: Array<{
    id: string;
    kind?: 'MONTHLY_USAGE' | 'SETUP_FEE';
    invoiceNumber: string;
    status: string;
    periodStart: Date;
    mau: number;
    billableUserCount?: number | null;
    billingRuleVersion?: string | null;
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
    setupFeeCharge?: {
      description: string;
      agreementReference: string;
      product: { key: string; displayName: string };
    } | null;
  }>,
  refundReviews: Array<{
    invoiceId: string;
    providerEventId: string;
    errorCategory: string | null;
    receivedAt: Date;
  }> = [],
) {
  const refundReviewByInvoiceId = new Map(
    refundReviews.map((review) => [review.invoiceId, review]),
  );
  return [
    [
      '内部請求番号',
      '運営団体',
      '法人名',
      '請求先名',
      '請求先メール',
      '請求種別',
      '対象月・合意日',
      '商品',
      '請求内容',
      '契約証跡',
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
      '課金対象人数',
      '課金ルール版',
      '返金要照合区分',
      '返金通知受信日時',
      'Stripe Event ID',
    ],
    ...invoices.map((invoice) => {
      const refundReview = refundReviewByInvoiceId.get(invoice.id);
      return [
        invoice.invoiceNumber,
        invoice.workspace.name,
        invoice.workspace.legalName,
        invoice.contract.billingName,
        invoice.contract.billingEmail,
        invoice.kind === 'SETUP_FEE' ? '初期費用' : '月額',
        invoice.kind === 'SETUP_FEE'
          ? invoice.periodStart.toISOString().slice(0, 10)
          : invoice.periodStart.toISOString().slice(0, 7),
        invoice.setupFeeCharge?.product.displayName ?? null,
        invoice.setupFeeCharge?.description ?? null,
        invoice.setupFeeCharge?.agreementReference ?? null,
        invoice.kind === 'SETUP_FEE' ? null : invoice.mau,
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
        invoice.kind === 'SETUP_FEE' ? null : invoiceBillableUserCount(invoice),
        invoice.kind === 'SETUP_FEE'
          ? 'SETUP_FEE_AGREEMENT_V1'
          : (invoice.billingRuleVersion ?? 'LEGACY_MAU'),
        refundReview?.errorCategory === 'FULL_REFUND_REVIEW_REQUIRED'
          ? '全額返金・要照合'
          : refundReview?.errorCategory === 'PARTIAL_REFUND_REVIEW_REQUIRED'
            ? '部分返金・要照合'
            : null,
        refundReview?.receivedAt.toISOString() ?? null,
        refundReview?.providerEventId ?? null,
      ];
    }),
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
    return new Response(
      csv(commercialBillingCsvRows(dashboard.invoices, dashboard.refundReviews)),
      {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="commercial-billing.csv"',
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        },
      },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
