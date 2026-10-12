export const TENANT_INVOICE_ACTIONS = ['ISSUE', 'MARK_PAID', 'VOID'] as const;
export type TenantInvoiceAction = (typeof TENANT_INVOICE_ACTIONS)[number];
export type TenantInvoiceLifecycleStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID';

export interface CommercialInvoiceSummaryInput {
  status: TenantInvoiceLifecycleStatus;
  amountYen: number;
  dueAt: Date | null;
}

export interface CommercialInvoiceSummary {
  draftCount: number;
  draftAmountYen: number;
  outstandingCount: number;
  outstandingAmountYen: number;
  overdueCount: number;
  overdueAmountYen: number;
  paidCount: number;
  paidAmountYen: number;
}

const allowedTransitions: Record<
  TenantInvoiceLifecycleStatus,
  Partial<Record<TenantInvoiceAction, TenantInvoiceLifecycleStatus>>
> = {
  DRAFT: { ISSUE: 'ISSUED', VOID: 'VOID' },
  ISSUED: { MARK_PAID: 'PAID', VOID: 'VOID' },
  PAID: {},
  VOID: {},
};

export function nextTenantInvoiceStatus(
  status: TenantInvoiceLifecycleStatus,
  action: TenantInvoiceAction,
): TenantInvoiceLifecycleStatus {
  const next = allowedTransitions[status][action];
  if (!next) throw new Error(`invoice cannot transition from ${status} using ${action}`);
  return next;
}

export function isTenantInvoiceOverdue(
  invoice: Pick<CommercialInvoiceSummaryInput, 'status' | 'dueAt'>,
  now = new Date(),
): boolean {
  return invoice.status === 'ISSUED' && invoice.dueAt !== null && invoice.dueAt < now;
}

export function summarizeCommercialInvoices(
  invoices: CommercialInvoiceSummaryInput[],
  now = new Date(),
): CommercialInvoiceSummary {
  return invoices.reduce<CommercialInvoiceSummary>(
    (summary, invoice) => {
      if (invoice.status === 'DRAFT') {
        summary.draftCount += 1;
        summary.draftAmountYen += invoice.amountYen;
      }
      if (invoice.status === 'ISSUED') {
        summary.outstandingCount += 1;
        summary.outstandingAmountYen += invoice.amountYen;
        if (isTenantInvoiceOverdue(invoice, now)) {
          summary.overdueCount += 1;
          summary.overdueAmountYen += invoice.amountYen;
        }
      }
      if (invoice.status === 'PAID') {
        summary.paidCount += 1;
        summary.paidAmountYen += invoice.amountYen;
      }
      return summary;
    },
    {
      draftCount: 0,
      draftAmountYen: 0,
      outstandingCount: 0,
      outstandingAmountYen: 0,
      overdueCount: 0,
      overdueAmountYen: 0,
      paidCount: 0,
      paidAmountYen: 0,
    },
  );
}

export function tenantInvoiceDueAt(issuedAt: Date, paymentTermsDays: number): Date {
  if (Number.isNaN(issuedAt.getTime())) throw new Error('invalid issuedAt');
  if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 365)
    throw new Error('invalid payment terms');
  return new Date(issuedAt.getTime() + paymentTermsDays * 24 * 60 * 60 * 1_000);
}

export function tenantInvoiceNumber(periodStart: Date, monthlyUsageId: string): string {
  if (Number.isNaN(periodStart.getTime()) || !monthlyUsageId.trim())
    throw new Error('invalid invoice identity');
  const month = periodStart.toISOString().slice(0, 7).replace('-', '');
  const suffix = monthlyUsageId.replaceAll('-', '').toUpperCase();
  return `WW-${month}-${suffix}`;
}

export interface OemSetupFeeChargeInput {
  chargeKey: string;
  amountYen: number;
  description: string;
  agreementReference: string;
  agreedAt: Date;
  reason: string;
}

export function assertOemSetupFeeCharge(input: OemSetupFeeChargeInput, now = new Date()): void {
  if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(input.chargeKey))
    throw new Error('invalid setup fee charge key');
  if (
    !Number.isSafeInteger(input.amountYen) ||
    input.amountYen <= 0 ||
    input.amountYen > 1_000_000_000
  )
    throw new Error('invalid setup fee amount');
  if (!input.description.trim() || input.description.trim().length > 200)
    throw new Error('invalid setup fee description');
  if (!input.agreementReference.trim() || input.agreementReference.trim().length > 200)
    throw new Error('invalid setup fee agreement reference');
  if (input.reason.trim().length < 10 || input.reason.trim().length > 1_000)
    throw new Error('invalid setup fee reason');
  if (
    Number.isNaN(input.agreedAt.getTime()) ||
    Number.isNaN(now.getTime()) ||
    input.agreedAt.getTime() > now.getTime()
  )
    throw new Error('invalid setup fee agreement date');
}

export function tenantSetupFeeInvoiceNumber(agreedAt: Date, chargeId: string): string {
  if (Number.isNaN(agreedAt.getTime()) || !chargeId.trim())
    throw new Error('invalid setup fee invoice identity');
  const date = agreedAt.toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = chargeId.replaceAll('-', '').toUpperCase();
  return `WW-SETUP-${date}-${suffix}`;
}
