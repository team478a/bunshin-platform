import { describe, expect, it } from 'vitest';
import {
  commercialInvoiceDocumentSnapshotSchema,
  renderCommercialInvoicePdf,
} from '../src/commercial-invoice-document';

const snapshot = {
  version: 1 as const,
  invoiceNumber: 'WW-202609-A',
  issuedAt: '2026-09-20T00:00:00.000Z',
  dueAt: '2026-10-20T00:00:00.000Z',
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-09-01T00:00:00.000Z',
  description: 'ワタシワークス OEM月額利用料（75 MAU）',
  quantity: 1 as const,
  taxRatePercent: 10 as const,
  subtotalYen: 18_000,
  taxYen: 1_800,
  totalYen: 19_800,
  issuer: {
    name: '和愛株式会社',
    postalCode: null,
    address: '兵庫県神戸市北区大沢町簾326番地の1',
    registrationNumber: null,
  },
  recipient: {
    name: '株式会社A 経理部',
    email: 'billing@example.com',
    organizationName: '株式会社A',
    address: '東京都千代田区1-1',
  },
};

describe('commercial invoice document', () => {
  it('accepts an immutable tax-inclusive invoice snapshot', () => {
    expect(commercialInvoiceDocumentSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('renders a downloadable A4 PDF with an embedded invoice image', async () => {
    const result = await renderCommercialInvoicePdf(snapshot);

    expect(result.pdf.subarray(0, 8).toString()).toBe('%PDF-1.7');
    expect(result.pdf.length).toBeGreaterThan(50_000);
    expect(result.pdf.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(result.pdf.toString('latin1')).toContain('/Filter /DCTDecode');
  }, 30_000);
});
