export type CommercialInvoiceCopyKind = 'MONTHLY_USAGE' | 'SETUP_FEE';

export function commercialInvoiceItemLabel(kind: CommercialInvoiceCopyKind): string {
  if (kind === 'MONTHLY_USAGE') return 'OEM月額利用料';
  if (kind === 'SETUP_FEE') return 'OEM初期費用';
  throw new Error('unsupported commercial invoice kind');
}

export function commercialInvoiceProviderDescription(
  kind: CommercialInvoiceCopyKind,
  invoiceNumber: string,
): string {
  return `ワタシワークス ${commercialInvoiceItemLabel(kind)} ${invoiceNumber}`;
}
