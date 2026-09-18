export const TENANT_INVOICE_ACTIONS = ['ISSUE', 'MARK_PAID', 'VOID'] as const;
export type TenantInvoiceAction = (typeof TENANT_INVOICE_ACTIONS)[number];
export type TenantInvoiceLifecycleStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID';

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
