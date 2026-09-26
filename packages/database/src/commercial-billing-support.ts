import { tenantInvoiceDueAt, type TenantInvoiceAction } from '@bunshin/application';
import type { Prisma } from '@prisma/client';

export interface SaveOrganizationCommercialContractInput {
  workspaceId: string;
  actorUserId: string;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ENDED';
  billingMode: 'MANUAL_INVOICE' | 'EXTERNAL_BILLING';
  billingName: string;
  billingEmail: string;
  paymentTermsDays: number;
  automaticRemindersEnabled: boolean;
  reminderLeadDays: number;
  overdueReminderIntervalDays: number;
  automaticCollectionEnabled: boolean;
  externalCustomerReference?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export interface TransitionTenantInvoiceInput {
  workspaceId: string;
  invoiceId: string;
  actorUserId: string;
  action: TenantInvoiceAction;
  externalInvoiceReference?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  documentIssuer?: {
    name: string;
    postalCode?: string | null;
    address: string;
    registrationNumber?: string | null;
  };
  now?: Date;
}

export interface PrepareCustomQuoteInvoiceInput {
  workspaceId: string;
  monthlyUsageId: string;
  actorUserId: string;
  amountYen: number;
  notes?: string | null;
}

export function optionalText(value: string | null | undefined, maximum: number): string | null {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  if (normalized.length > maximum) throw new Error('text is too long');
  return normalized;
}

export function requiredText(value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error('invalid required text');
  return normalized;
}

export function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function invoiceDocumentSnapshot(
  invoice: {
    invoiceNumber: string;
    periodStart: Date;
    periodEnd: Date;
    mau: number;
    amountYen: number;
    workspace: { name: string; legalName: string | null; address: string | null };
    contract: { billingName: string; billingEmail: string; paymentTermsDays: number };
  },
  issuer: NonNullable<TransitionTenantInvoiceInput['documentIssuer']>,
  issuedAt: Date,
) {
  const taxYen = Math.floor((invoice.amountYen * 10) / 110);
  return jsonSnapshot({
    version: 1,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: issuedAt.toISOString(),
    dueAt: tenantInvoiceDueAt(issuedAt, invoice.contract.paymentTermsDays).toISOString(),
    periodStart: invoice.periodStart.toISOString(),
    periodEnd: invoice.periodEnd.toISOString(),
    description: `ワタシワークス OEM月額利用料（${invoice.mau.toLocaleString('ja-JP')} MAU）`,
    quantity: 1,
    taxRatePercent: 10,
    subtotalYen: invoice.amountYen - taxYen,
    taxYen,
    totalYen: invoice.amountYen,
    issuer: {
      name: requiredText(issuer.name, 200),
      postalCode: optionalText(issuer.postalCode, 20),
      address: requiredText(issuer.address, 500),
      registrationNumber: optionalText(issuer.registrationNumber, 30),
    },
    recipient: {
      name: invoice.contract.billingName,
      email: invoice.contract.billingEmail,
      organizationName: invoice.workspace.legalName ?? invoice.workspace.name,
      address: invoice.workspace.address,
    },
  });
}

type CommercialReminderAudit = {
  workspaceId: string;
  entityId: string;
  action: string;
  occurredAt: Date;
};

export function unresolvedCommercialReminderFailures<T extends CommercialReminderAudit>(
  audits: T[],
): T[] {
  const latest = new Map<string, T>();
  for (const audit of audits) {
    const kind = audit.action.startsWith('PAYMENT_GUIDANCE_')
      ? 'INITIAL'
      : audit.action.startsWith('OVERDUE_REMINDER_')
        ? 'OVERDUE'
        : null;
    if (!kind) continue;
    const key = `${audit.workspaceId}:${audit.entityId}:${kind}`;
    const current = latest.get(key);
    if (!current || audit.occurredAt > current.occurredAt) latest.set(key, audit);
  }
  return [...latest.values()].filter((audit) => audit.action.endsWith('_FAILED'));
}
